// 매일 cron의 공식 연계 모드(apply·off 전환 안전장치). 가짜 prisma·의존성만 쓴다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runReferenceDataCron } from './referenceData.js';

const NOW = () => new Date('2026-10-20T19:00:00Z'); // 2026-10-21 04:00 KST

// 출처별 커서를 흉내 내는 가짜 prisma
const createPrisma = ({ linkCursor = '2026-10-17', deltaCursor = '2026-10-16' } = {}) => {
  const state = { jobs: [], createdImports: [], linkCursor, deltaCursor };
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
        if (where.status === 'PARTIAL') return null;
        const ymd = where.source === 'JUSO_LINK' ? state.linkCursor : state.deltaCursor;
        return ymd ? { fileDate: new Date(`${ymd}T00:00:00Z`) } : null;
      },
      create: async ({ data }) => state.createdImports.push(data),
    },
  };
  return { prisma, state };
};

const fullDay = () => ({
  100001: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
  100004: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
  100005: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
});

const newCalls = () => ({ download: [], linkDownload: [], apply: [], deltaApply: [] });

const deps = (calls, state, { mode = 'apply', available = ['2026-10-18', '2026-10-19'] } = {}) => ({
  mode,
  download: async (date) => {
    calls.download.push(date);
    return { found: false };
  },
  applyFile: async ({ fileDate }) => {
    calls.deltaApply.push(fileDate);
    return { status: 'SUCCEEDED' };
  },
  downloadLinkDays: async (from, to) => {
    calls.linkDownload.push(`${from}~${to}`);
    return new Map(available.map((date) => [date, fullDay()]));
  },
  readLinkDay: async () => ({ tables: {}, fileSize: 1n, fileSha1: 'x' }),
  applyLinkDay: async ({ linkDate, deadlineAt }) => {
    calls.apply.push({ linkDate, deadlineAt });
    state.linkCursor = linkDate;
    return { status: 'SUCCEEDED', stats: { lines: 3, unresolvedCount: 0 } };
  },
  fillBasis: async () => ({ processed: 0, filled: 0, failed: 0, notFound: 0, linkKeys: [], stopReason: 'no more rows' }),
  refill: async () => 0,
  cleanupSearchResults: async () => 0,
});

const run = (prisma, depsValue) => runReferenceDataCron({ prisma, t0: Date.now(), bootAt: 0, coldStart: false, now: NOW, deps: depsValue });

test('apply 모드: 범위를 한 번 받아 날짜 순서대로, 세 자료가 다 있는 날까지만. 일변동분은 돌지 않는다', async () => {
  const { prisma, state } = createPrisma();
  const calls = newCalls();
  const result = await run(prisma, deps(calls, state));
  assert.equal(result.mode, 'apply');
  assert.deepEqual(calls.linkDownload, ['2026-10-18~2026-10-20']);
  assert.deepEqual(calls.apply.map((call) => call.linkDate), ['2026-10-18', '2026-10-19']);
  assert.match(result.delta.stopReason, /not published yet: 2026-10-20/);
  assert.deepEqual(calls.deltaApply, []);
  assert.equal(result.shadow, null);
});

test('apply 모드: 오래된 날짜 자료가 없으면 FAILED를 남기고 멈춘다(건너뛰지 않음)', async () => {
  const { prisma, state } = createPrisma({ linkCursor: '2026-10-10', deltaCursor: '2026-10-09' });
  const calls = newCalls();
  const result = await run(prisma, deps(calls, state, { available: [] }));
  assert.match(result.delta.stopReason, /file not found: 2026-10-11/);
  assert.equal(state.createdImports[0].source, 'JUSO_LINK');
  assert.match(state.createdImports[0].error, /file not found/);
  assert.deepEqual(calls.apply, []);
});

test('apply 모드: 기준점이 없으면 하지 않고, 일변동분 커서가 앞서 있으면 멈춘다', async () => {
  const noBaseline = createPrisma({ linkCursor: null });
  const result = await run(noBaseline.prisma, deps(newCalls(), noBaseline.state));
  assert.equal(result.delta.stopReason, 'no baseline (run juso-link:cutover)');

  const ahead = createPrisma({ linkCursor: '2026-10-17', deltaCursor: '2026-10-18' });
  const result2 = await run(ahead.prisma, deps(newCalls(), ahead.state));
  assert.match(result2.delta.stopReason, /juso delta cursor ahead/);
});

test('off 모드: 공식 연계 커서가 앞서 있으면(전환 뒤 모드만 되돌림) 일변동분을 받지도 적용하지도 않는다', async () => {
  const { prisma, state } = createPrisma({ linkCursor: '2026-10-19', deltaCursor: '2026-10-16' });
  const calls = newCalls();
  const result = await run(prisma, deps(calls, state, { mode: 'off' }));
  assert.match(result.delta.stopReason, /juso link cursor ahead/);
  assert.deepEqual(calls.download, []);
  assert.deepEqual(calls.linkDownload, []);
});

test('shadow 모드: 공식 연계 비교 단계를 먼저 돌리고 그다음 일변동분(비교 실패는 결과에만 남는다)', async () => {
  const { prisma, state } = createPrisma({ linkCursor: null, deltaCursor: '2026-10-17' });
  // 이 가짜 prisma에는 findMany가 없어서 비교 단계가 에러로 끝난다 → 일변동분 단계는 그대로 돈다
  const calls = newCalls();
  const result = await run(prisma, deps(calls, state, { mode: 'shadow' }));
  assert.equal(result.mode, 'shadow');
  assert.ok(result.shadow.error);
  assert.deepEqual(calls.download, ['2026-10-18']);
});
