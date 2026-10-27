// 관리자 즉시 갱신(runJusoRefreshNow). 가짜 prisma·의존성만 쓴다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JUSO_REFRESH_JOB_TYPE, JusoRefreshBusyError, runJusoRefreshNow } from './referenceData.js';

const NOW = () => new Date('2026-10-20T19:00:00Z'); // 2026-10-21 04:00 KST

const createPrisma = ({ busy = false, deltaCursor = '2026-10-18', linkCursor = '2026-10-19' } = {}) => {
  const state = { jobs: [], deltaCursor, linkCursor };
  const prisma = {
    job: {
      findFirst: async () => (busy ? { id: 'busy' } : null),
      create: async ({ data }) => {
        state.jobs.push({ ...data, id: `job-${state.jobs.length}` });
        return { id: `job-${state.jobs.length - 1}` };
      },
      update: async ({ where, data }) => Object.assign(state.jobs.find((job) => job.id === where.id), data),
    },
    referenceDataImport: {
      findFirst: async ({ where }) => {
        if (where.status === 'PARTIAL') return null;
        const ymd = where.source === 'JUSO_LINK' ? state.linkCursor : state.deltaCursor;
        return ymd ? { fileDate: new Date(`${ymd}T00:00:00Z`) } : null;
      },
      create: async () => null,
    },
  };
  return { prisma, state };
};

const deps = (calls, state, mode) => ({
  mode,
  download: async (date) => {
    calls.delta.push(date);
    return date <= '2026-10-19' ? { found: true, buffer: Buffer.from('x'), fileName: `${date}.zip` } : { found: false };
  },
  applyFile: async ({ fileDate, keySet }) => {
    state.deltaCursor = fileDate;
    keySet.add({ sigunguCd: '11350', roadNameKey: '섬밭로', underground: false, mainNo: 285, subNo: 0 });
    return { status: 'SUCCEEDED', stats: { lines: 1 } };
  },
  downloadLinkDays: async (from, to) => {
    calls.link.push(`${from}~${to}`);
    return new Map();
  },
  readLinkDay: async () => ({}),
  applyLinkDay: async () => ({ status: 'SUCCEEDED' }),
  refill: async (prisma, keys) => keys.length,
});

test('즉시 갱신: 모드가 off·shadow면 일변동분으로 밀린 날을 적용하고 단지 kaptCode를 다시 채운다, jobs에 요청자', async () => {
  const { prisma, state } = createPrisma();
  const calls = { delta: [], link: [] };
  const result = await runJusoRefreshNow({ prisma, requestedBy: 'admin-1', now: NOW, deps: deps(calls, state, 'shadow') });
  assert.equal(result.mode, 'shadow');
  assert.deepEqual(calls.delta, ['2026-10-19', '2026-10-20']);
  assert.deepEqual(calls.link, []);
  assert.equal(result.complexKaptCodesChanged, 1);
  assert.equal(state.jobs[0].type, JUSO_REFRESH_JOB_TYPE);
  assert.equal(state.jobs[0].requestedByUserId, 'admin-1');
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
  assert.equal(result.jobId, 'job-0');
});

test('즉시 갱신: apply 모드면 공식 연계', async () => {
  const { prisma, state } = createPrisma();
  const calls = { delta: [], link: [] };
  const result = await runJusoRefreshNow({ prisma, requestedBy: 'admin-1', now: NOW, deps: deps(calls, state, 'apply') });
  assert.equal(result.mode, 'apply');
  assert.deepEqual(calls.link, ['2026-10-20~2026-10-20']);
  assert.deepEqual(calls.delta, []);
});

test('즉시 갱신: 이미 도는 즉시 갱신이 있으면 거부(jobs를 만들지 않음)', async () => {
  const { prisma, state } = createPrisma({ busy: true });
  await assert.rejects(runJusoRefreshNow({ prisma, now: NOW, deps: deps({ delta: [], link: [] }, state, 'off') }), JusoRefreshBusyError);
  assert.equal(state.jobs.length, 0);
});
