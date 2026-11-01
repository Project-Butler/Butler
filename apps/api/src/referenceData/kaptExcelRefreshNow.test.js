// 관리자 즉시 갱신(runKaptBasisRefreshNow). 가짜 prisma·의존성만 쓴다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KAPT_BASIS_REFRESH_JOB_TYPE, runKaptBasisRefreshNow } from './kaptExcelRefresh.js';
import { ImportAlreadyRunningError, ImportGateError } from './referenceImports.js';

const createPrisma = ({ busy = false } = {}) => {
  const jobs = [];
  return {
    jobs,
    job: {
      findFirst: async () => (busy ? { id: 'busy' } : null),
      create: async ({ data }) => {
        jobs.push({ ...data, id: `job-${jobs.length}` });
        return { id: `job-${jobs.length - 1}` };
      },
      update: async ({ where, data }) => Object.assign(jobs.find((job) => job.id === where.id), data),
    },
  };
};

test('갱신 결과를 돌려주고 요청한 관리자와 함께 jobs에 남긴다', async () => {
  const prisma = createPrisma();
  const result = await runKaptBasisRefreshNow({ prisma, requestedBy: 'admin-1', refresh: async () => ({ status: 'SKIPPED', lastFileDate: '2026-10-30' }) });
  assert.equal(result.jobId, 'job-0');
  assert.deepEqual(result.kapt, { status: 'SKIPPED', lastFileDate: '2026-10-30' });
  const [job] = prisma.jobs;
  assert.equal(job.type, KAPT_BASIS_REFRESH_JOB_TYPE);
  assert.equal(job.requestedById, 'admin-1');
  assert.equal(job.status, 'SUCCEEDED');
  assert.equal(job.lockedAt, null);
});

test('갱신이 실패하면 사유를 응답에 담고 job은 FAILED', async () => {
  const prisma = createPrisma();
  const refresh = async () => {
    throw new ImportGateError('rows read 1 < 20000');
  };
  const result = await runKaptBasisRefreshNow({ prisma, refresh });
  assert.deepEqual(result.kapt, { error: 'rows read 1 < 20000' });
  assert.equal(prisma.jobs[0].status, 'FAILED');
});

test('즉시 갱신이 돌고 있으면 시작하지 않는다', async () => {
  const prisma = createPrisma({ busy: true });
  const refresh = async () => assert.fail('시작하면 안 된다');
  await assert.rejects(runKaptBasisRefreshNow({ prisma, refresh }), ImportAlreadyRunningError);
  assert.equal(prisma.jobs.length, 0);
});

test('적재가 이미 돌고 있으면 그대로 던지고 job은 FAILED로 닫는다', async () => {
  const prisma = createPrisma();
  const refresh = async () => {
    throw new ImportAlreadyRunningError('kapt');
  };
  await assert.rejects(runKaptBasisRefreshNow({ prisma, refresh }), ImportAlreadyRunningError);
  assert.equal(prisma.jobs[0].status, 'FAILED');
  assert.equal(prisma.jobs[0].lockedAt, null);
});
