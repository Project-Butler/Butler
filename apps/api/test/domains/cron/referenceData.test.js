import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLD_START_MAX_MS, PHASES, resolveBudgetBase, runReferenceDataCron } from '../../../src/domains/cron/referenceData.js';

// jobs·data_imports만 흉내 내는 가짜 prisma. cursor: 마지막 공식 연계 성공 날짜
const createFakePrisma = ({ cursor = '2026-10-17', partial = null } = {}) => {
  const state = { jobs: [], createdImports: [], cursor, partial };
  const prisma = {
    job: {
      create: async ({ data }) => {
        state.jobs.push({ ...data, id: `job-${state.jobs.length}` });
        return { id: `job-${state.jobs.length - 1}` };
      },
      update: async ({ where, data }) => Object.assign(state.jobs.find((job) => job.id === where.id), data),
    },
    dataImport: {
      findFirst: async ({ where }) => {
        if (where.status === 'PARTIAL') return state.partial;
        return state.cursor ? { fileDate: new Date(`${state.cursor}T00:00:00Z`) } : null;
      },
      create: async ({ data }) => state.createdImports.push(data),
    },
  };
  return { prisma, state };
};

const NOW = () => new Date('2026-10-20T19:00:00Z'); // 2026-10-21 04:00 KST

const fullDay = () => ({
  100001: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
  100004: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
  100005: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
});

// 성공한 날은 커서를 그 날짜로 옮긴다(실제 applyJusoLinkDay처럼).
const fakeDeps = (calls, state, { available = ['2026-10-18', '2026-10-19'] } = {}) => ({
  downloadLinkDays: async (from, to) => {
    calls.download.push(`${from}~${to}`);
    return new Map(available.map((date) => [date, fullDay()]));
  },
  readLinkDay: async () => ({ tables: {}, fileSize: 1n, fileSha1: 'x' }),
  applyLinkDay: async ({ linkDate, deadlineAt, keySet }) => {
    calls.apply.push({ linkDate, deadlineAt });
    state.cursor = linkDate;
    keySet.add({ sigunguCd: '11350', roadNameKey: '섬밭로', underground: false, mainNo: 285, subNo: 0 });
    return { status: 'SUCCEEDED', stats: { lines: 10, unresolvedCount: 0 } };
  },
  fillBasis: async ({ deadlineAt }) => {
    calls.basis.push(deadlineAt);
    return { processed: 0, filled: 0, failed: 0, notFound: 0, linkKeys: [], stopReason: 'no more rows' };
  },
  refill: async (prisma, keys) => {
    calls.refill.push(keys.length);
    return 1;
  },
  cleanupSearchResults: async () => 0,
  expireStaleAttempts: async () => 2,
  cleanupExpiredUploads: async () => ({ uploadsDeleted: 1, documentsDeleted: 0 }),
});

const newCalls = () => ({ download: [], apply: [], basis: [], refill: [] });
const run = (prisma, deps, t0 = Date.now()) => runReferenceDataCron({ prisma, t0, bootAt: 0, coldStart: false, now: NOW, deps });

test('멈춘 인증 시도 정리: 맨 앞에서 돌고, 실패해도 나머지 단계는 돈다', async () => {
  const calls = newCalls();
  const { prisma, state } = createFakePrisma();
  const order = [];
  const deps = fakeDeps(calls, state);
  const applied = await run(prisma, { ...deps, expireStaleAttempts: async () => (order.push(calls.download.length), 2) });
  assert.deepEqual(order, [0]);
  assert.deepEqual(applied.staleAttempts, { expired: 2 });

  const failed = await run(prisma, {
    ...deps,
    expireStaleAttempts: async () => {
      throw Object.assign(new Error('x'), { code: 'P1001' });
    },
  });
  assert.deepEqual(failed.staleAttempts, { error: 'P1001' });
  assert.ok(calls.basis.length >= 2);
});

test('만료 업로드 정리: 인증 시도 정리 다음에 돌고, 실패해도 나머지 단계는 돈다', async () => {
  const calls = newCalls();
  const { prisma, state } = createFakePrisma();
  const order = [];
  const deps = fakeDeps(calls, state);
  const applied = await run(prisma, {
    ...deps,
    expireStaleAttempts: async () => (order.push('attempts'), 0),
    cleanupExpiredUploads: async () => (order.push(`uploads:${calls.download.length}`), { uploadsDeleted: 3, documentsDeleted: 1 }),
  });
  assert.deepEqual(order, ['attempts', 'uploads:0']);
  assert.deepEqual(applied.documentCleanup, { uploadsDeleted: 3, documentsDeleted: 1 });

  const failed = await run(prisma, {
    ...deps,
    cleanupExpiredUploads: async () => {
      throw Object.assign(new Error('x'), { code: 'EACCES' });
    },
  });
  assert.deepEqual(failed.documentCleanup, { error: 'EACCES' });
  assert.deepEqual(failed.staleAttempts, { expired: 2 });
  assert.ok(calls.basis.length >= 2);
});

test('시간 예산 기준: 데워진 인스턴스는 요청 시각, 콜드 스타트 직후 첫 호출만 모듈 로드 시각', () => {
  const t0 = 1_000_000;
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - 600_000, coldStart: false }), t0);
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - 600_000, coldStart: true }), t0); // 로드가 10분 전이면 콜드 스타트로 보지 않음
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - 2_000, coldStart: true }), t0 - 2_000);
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - COLD_START_MAX_MS, coldStart: true }), t0);
});

test('데워진 인스턴스: 범위를 한 번 받아 날짜 순서대로, 세 자료가 다 있는 날까지만 적용한다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-17' });
  const calls = newCalls();
  const t0 = Date.now();
  const result = await runReferenceDataCron({ prisma, t0, bootAt: t0 - 10 * 60_000, coldStart: false, now: NOW, deps: fakeDeps(calls, state) });

  assert.ok(result.elapsedAtStart < 1000);
  assert.deepEqual(calls.download, ['2026-10-18~2026-10-20']);
  assert.deepEqual(calls.apply.map((call) => call.linkDate), ['2026-10-18', '2026-10-19']);
  assert.match(result.juso.stopReason, /not published yet: 2026-10-20/);
  assert.equal(result.juso.failed, false);
  assert.equal(calls.apply[0].deadlineAt, t0 + PHASES.linkEndMs);
  assert.deepEqual(calls.basis, [t0 + PHASES.basisEndMs]);
  assert.deepEqual(calls.refill, [1]);
  assert.equal(state.jobs[0].type, 'REFERENCE_DATA_DAILY');
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
  assert.equal(state.jobs[0].payload.elapsedAtStart, result.elapsedAtStart);
});

test('콜드 스타트 직후 첫 호출: 모듈 로드 시각부터 잰다', async () => {
  const { prisma, state } = createFakePrisma();
  const calls = newCalls();
  const t0 = Date.now();
  const result = await runReferenceDataCron({ prisma, t0, bootAt: t0 - 3_000, coldStart: true, now: NOW, deps: fakeDeps(calls, state) });
  assert.ok(result.elapsedAtStart >= 3_000);
  assert.equal(calls.apply[0].deadlineAt, t0 - 3_000 + PHASES.linkEndMs);
});

test('어제·그제 자료가 아직 없으면 실패로 남기지 않고 멈춘다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-19' });
  const calls = newCalls();
  const result = await run(prisma, fakeDeps(calls, state, { available: [] }));
  assert.deepEqual(calls.download, ['2026-10-20~2026-10-20']);
  assert.match(result.juso.stopReason, /not published yet: 2026-10-20/);
  assert.deepEqual(state.createdImports, []);
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
});

test('오래된 날짜 자료가 없으면 FAILED를 남기고 건너뛰지 않는다, job도 FAILED', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-10' });
  const calls = newCalls();
  const result = await run(prisma, fakeDeps(calls, state, { available: [] }));
  assert.match(result.juso.stopReason, /file not found: 2026-10-11/);
  assert.equal(state.createdImports[0].source, 'JUSO_LINK');
  assert.equal(state.createdImports[0].status, 'FAILED');
  assert.match(state.createdImports[0].error, /file not found/);
  assert.deepEqual(calls.apply, []);
  assert.equal(state.jobs[0].status, 'FAILED');
});

test('API를 받지 못하면(키 없음·장애) 다음 단계는 돌고 job은 FAILED', async () => {
  const { prisma, state } = createFakePrisma();
  const calls = newCalls();
  const failing = async () => {
    throw Object.assign(new Error('no key'), { reason: 'JUSO_LINK_API_KEY missing' });
  };
  const result = await run(prisma, { ...fakeDeps(calls, state), downloadLinkDays: failing });
  assert.equal(result.juso.stopReason, 'download failed: JUSO_LINK_API_KEY missing');
  assert.equal(calls.basis.length, 1);
  assert.equal(state.jobs[0].status, 'FAILED');
});

test('적용 게이트가 실패하면 그 날짜에서 멈추고 job은 FAILED', async () => {
  const { prisma, state } = createFakePrisma();
  const calls = newCalls();
  const applyLinkDay = async () => ({ status: 'FAILED', reason: 'unresolved 5/100' });
  const result = await run(prisma, { ...fakeDeps(calls, state), applyLinkDay });
  assert.equal(result.juso.stopReason, 'FAILED: unresolved 5/100');
  assert.equal(result.juso.days.length, 1);
  assert.equal(state.jobs[0].status, 'FAILED');
});

test('전체분 적재 전(커서 없음)이면 juso 단계는 건너뛰고 실패로 치지 않는다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: null });
  const calls = newCalls();
  const result = await run(prisma, fakeDeps(calls, state));
  assert.equal(result.juso.stopReason, 'no baseline (run import:juso-buildings)');
  assert.deepEqual(calls.download, []);
  assert.equal(calls.basis.length, 1);
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
});

test('PARTIAL이 있으면 그 날짜부터 이어서', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-15', partial: { fileDate: new Date('2026-10-16T00:00:00Z') } });
  const calls = newCalls();
  const deps = {
    ...fakeDeps(calls, state, { available: ['2026-10-16'] }),
    applyLinkDay: async ({ linkDate }) => (calls.apply.push({ linkDate }), { status: 'PARTIAL' }),
  };
  const result = await run(prisma, deps);
  assert.deepEqual(calls.download, ['2026-10-16~2026-10-20']);
  assert.equal(result.juso.stopReason, 'PARTIAL');
  assert.equal(result.juso.failed, false);
});

test('구간 마감이 이미 지났으면(기준 시각이 오래 전) 기본정보·마무리를 시작하지 않는다', async () => {
  const { prisma, state } = createFakePrisma();
  const result = await run(prisma, fakeDeps(newCalls(), state), Date.now() - 55_000);
  assert.equal(result.juso.stopReason, 'download cutoff');
  assert.deepEqual(result.basis, { skipped: 'time budget' });
  assert.deepEqual(result.finalize, { skipped: 'hard stop' });
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
});
