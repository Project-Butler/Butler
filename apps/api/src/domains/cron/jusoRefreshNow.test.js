// 관리자 즉시 갱신(runJusoRefreshNow). 가짜 prisma·의존성만 쓴다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JUSO_REFRESH_JOB_TYPE, JusoRefreshBusyError, runJusoRefreshNow } from './referenceData.js';

const NOW = () => new Date('2026-10-20T19:00:00Z'); // 2026-10-21 04:00 KST

const createPrisma = ({ busy = false, cursor = '2026-10-18' } = {}) => {
  const state = { jobs: [], cursor };
  const prisma = {
    job: {
      findFirst: async () => (busy ? { id: 'busy' } : null),
      create: async ({ data }) => {
        state.jobs.push({ ...data, id: `job-${state.jobs.length}` });
        return { id: `job-${state.jobs.length - 1}` };
      },
      update: async ({ where, data }) => Object.assign(state.jobs.find((job) => job.id === where.id), data),
    },
    dataImport: {
      findFirst: async ({ where }) => {
        if (where.status === 'PARTIAL') return null;
        return state.cursor ? { fileDate: new Date(`${state.cursor}T00:00:00Z`) } : null;
      },
      create: async () => null,
    },
  };
  return { prisma, state };
};

const fullDay = () => ({
  100001: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
  100004: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
  100005: [{ resCode: 'P0000', zip: Buffer.from('PK') }],
});

const deps = (calls, state) => ({
  downloadLinkDays: async (from, to) => {
    calls.link.push(`${from}~${to}`);
    return new Map([['2026-10-19', fullDay()]]);
  },
  readLinkDay: async () => ({ tables: {}, fileSize: 1n, fileSha1: 'x' }),
  applyLinkDay: async ({ linkDate, keySet }) => {
    state.cursor = linkDate;
    keySet.add({ sigunguCd: '11350', roadNameKey: '섬밭로', underground: false, mainNo: 285, subNo: 0 });
    return { status: 'SUCCEEDED', stats: { lines: 1 } };
  },
  refill: async (prisma, keys) => keys.length,
});

test('즉시 갱신: 공식 연계로 밀린 날을 적용하고 단지 kaptCode를 다시 채운다, jobs에 요청자', async () => {
  const { prisma, state } = createPrisma();
  const calls = { link: [] };
  const result = await runJusoRefreshNow({ prisma, requestedBy: 'admin-1', now: NOW, deps: deps(calls, state) });
  assert.deepEqual(calls.link, ['2026-10-19~2026-10-20']);
  assert.deepEqual(result.juso.days.map((day) => day.linkDate), ['2026-10-19']);
  assert.equal(result.complexKaptCodesChanged, 1);
  assert.equal(state.jobs[0].type, JUSO_REFRESH_JOB_TYPE);
  assert.equal(state.jobs[0].requestedById, 'admin-1');
  assert.equal(state.jobs[0].status, 'SUCCEEDED');
  assert.equal(result.jobId, 'job-0');
});

test('즉시 갱신: API를 받지 못하면 사유를 응답에 담고 job은 FAILED', async () => {
  const { prisma, state } = createPrisma();
  const failing = async () => {
    throw Object.assign(new Error('no key'), { reason: 'JUSO_LINK_API_KEY missing' });
  };
  const result = await runJusoRefreshNow({ prisma, now: NOW, deps: { ...deps({ link: [] }, state), downloadLinkDays: failing } });
  assert.equal(result.juso.stopReason, 'download failed: JUSO_LINK_API_KEY missing');
  assert.equal(result.juso.failed, true);
  assert.equal(state.jobs[0].status, 'FAILED');
});

test('즉시 갱신: 이미 도는 즉시 갱신이 있으면 거부(jobs를 만들지 않음)', async () => {
  const { prisma, state } = createPrisma({ busy: true });
  await assert.rejects(runJusoRefreshNow({ prisma, now: NOW, deps: deps({ link: [] }, state) }), JusoRefreshBusyError);
  assert.equal(state.jobs.length, 0);
});
