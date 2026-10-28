import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLD_START_MAX_MS, PHASES, resolveBudgetBase, runReferenceDataCron } from './referenceData.js';

// jobs·data_imports만 흉내 내는 가짜 prisma. cursor: 마지막 변동분 성공 날짜
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

// 성공한 파일은 커서를 그 날짜로 옮긴다(실제 applyJusoDeltaFile처럼). 모드는 off(공식 연계 안 씀).
const fakeDeps = (calls, state) => ({
  mode: 'off',
  download: async (date) => {
    calls.download.push(date);
    return date <= '2026-10-19' ? { found: true, buffer: Buffer.from('x'), fileName: `${date}.zip` } : { found: false };
  },
  applyFile: async ({ fileDate, deadlineAt, keySet }) => {
    calls.apply.push({ fileDate, deadlineAt });
    state.cursor = fileDate;
    keySet.add({ sigunguCd: '11350', roadNameKey: '섬밭로', underground: false, mainNo: 285, subNo: 0 });
    return { status: 'SUCCEEDED', stats: { lines: 10 } };
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
});

const newCalls = () => ({ download: [], apply: [], basis: [], refill: [] });

test('시간 예산 기준: 데워진 인스턴스는 요청 시각, 콜드 스타트 직후 첫 호출만 모듈 로드 시각', () => {
  const t0 = 1_000_000;
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - 600_000, coldStart: false }), t0);
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - 600_000, coldStart: true }), t0); // 로드가 10분 전이면 콜드 스타트로 보지 않음
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - 2_000, coldStart: true }), t0 - 2_000);
  assert.equal(resolveBudgetBase({ t0, bootAt: t0 - COLD_START_MAX_MS, coldStart: true }), t0);
});

test('데워진 인스턴스: 모듈 로드 10분 전이어도 변동분 단계가 실제로 돈다, elapsedAtStart가 작다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-17' });
  const calls = newCalls();
  const t0 = Date.now();
  const result = await runReferenceDataCron({ prisma, t0, bootAt: t0 - 10 * 60_000, coldStart: false, now: NOW, deps: fakeDeps(calls, state) });

  assert.ok(result.elapsedAtStart < 1000);
  // 커서 다음 날(10-18)부터, 받을 수 있는 날짜(어제 KST = 10-20)까지 — 10-20은 아직 없음
  assert.deepEqual(calls.download, ['2026-10-18', '2026-10-19', '2026-10-20']);
  assert.deepEqual(calls.apply.map((call) => call.fileDate), ['2026-10-18', '2026-10-19']);
  assert.match(result.delta.stopReason, /not published yet: 2026-10-20/);
  assert.equal(calls.apply[0].deadlineAt, t0 + PHASES.deltaEndMs);
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
  assert.equal(calls.apply[0].deadlineAt, t0 - 3_000 + PHASES.deltaEndMs);
});

test('어제·그제 파일이 아직 없으면 실패로 남기지 않고 멈춘다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-19' });
  const calls = newCalls();
  const result = await runReferenceDataCron({ prisma, t0: Date.now(), bootAt: 0, coldStart: false, now: NOW, deps: fakeDeps(calls, state) });
  assert.deepEqual(calls.download, ['2026-10-20']);
  assert.match(result.delta.stopReason, /not published yet: 2026-10-20/);
  assert.deepEqual(state.createdImports, []);
});

test('오래된 날짜 파일이 없으면 FAILED("file not found")를 남기고 건너뛰지 않는다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-10' });
  const calls = newCalls();
  const deps = { ...fakeDeps(calls, state), download: async (date) => (calls.download.push(date), { found: false }) };
  const result = await runReferenceDataCron({ prisma, t0: Date.now(), bootAt: 0, coldStart: false, now: NOW, deps });
  assert.deepEqual(calls.download, ['2026-10-11']);
  assert.match(result.delta.stopReason, /file not found: 2026-10-11/);
  assert.equal(state.createdImports[0].status, 'FAILED');
  assert.equal(state.createdImports[0].error, 'file not found');
});

test('전체분 적재 전(커서 없음)이면 변동분 단계는 건너뛴다', async () => {
  const { prisma, state } = createFakePrisma({ cursor: null });
  const calls = newCalls();
  const result = await runReferenceDataCron({ prisma, t0: Date.now(), bootAt: 0, coldStart: false, now: NOW, deps: fakeDeps(calls, state) });
  assert.equal(result.delta.stopReason, 'no baseline');
  assert.deepEqual(calls.download, []);
  assert.equal(calls.basis.length, 1);
});

test('PARTIAL이 있으면 그 날짜 파일부터 이어서', async () => {
  const { prisma, state } = createFakePrisma({ cursor: '2026-10-15', partial: { fileDate: new Date('2026-10-16T00:00:00Z') } });
  void state;
  const calls = newCalls();
  const deps = { ...fakeDeps(calls, state), applyFile: async ({ fileDate }) => (calls.apply.push({ fileDate }), { status: 'PARTIAL' }) };
  const result = await runReferenceDataCron({ prisma, t0: Date.now(), bootAt: 0, coldStart: false, now: NOW, deps });
  assert.deepEqual(calls.download, ['2026-10-16']);
  assert.equal(result.delta.stopReason, 'PARTIAL');
});

test('구간 마감이 이미 지났으면(기준 시각이 오래 전) 기본정보·마무리를 시작하지 않는다', async () => {
  const { prisma, state } = createFakePrisma();
  const calls = newCalls();
  const t0 = Date.now() - 55_000;
  const result = await runReferenceDataCron({ prisma, t0, bootAt: 0, coldStart: false, now: NOW, deps: fakeDeps(calls, state) });
  assert.equal(result.delta.stopReason, 'download cutoff');
  assert.deepEqual(result.basis, { skipped: 'time budget' });
  assert.deepEqual(result.finalize, { skipped: 'hard stop' });
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
});
