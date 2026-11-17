// 처음 보는 단지(규격의 COLLECTING) 작업 — 시세 계획서 5절.
// GET /jobs/:jobId 는 요청한 본인 · ADMIN 만 보므로 요청한 사람 이름으로 작업을 만든다(같은 사람 · 같은 시군구 대기 작업이 있으면 재사용).
// 상시 작업 처리기는 없다 — 정기 실행(cron)이 그 시군구를 채우면 대기 작업들을 SUCCEEDED 로 바꾼다.
// Job 은 Core 모델이지만 type 이 문자열이라 고치지 않는다(새 type 이름만 쓴다).

import { prisma } from '../../../platform/prismaClient.js';
import { BACKFILL_JOB_TYPE } from '../marketPriceRules.js';

const pendingFor = (sigunguCode) => ({ type: BACKFILL_JOB_TYPE, status: 'PENDING', payload: { path: ['sigunguCode'], equals: sigunguCode } });

// 요청한 사람의 대기 작업 id(없으면 만든다)
export const ensureBackfillJob = async (userId, sigunguCode) => {
  const existing = await prisma.job.findFirst({ where: { ...pendingFor(sigunguCode), requestedById: userId }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing.id;
  const job = await prisma.job.create({
    data: { type: BACKFILL_JOB_TYPE, status: 'PENDING', payload: { sigunguCode }, requestedById: userId },
    select: { id: true },
  });
  return job.id;
};

// 대기 작업이 걸린 시군구들 — 정기 실행 대상에 더한다(요청한 사람이 기다리는 곳은 모은다)
export const listPendingBackfillSigunguCodes = async () => {
  const jobs = await prisma.job.findMany({ where: { type: BACKFILL_JOB_TYPE, status: 'PENDING' }, select: { payload: true } });
  return jobs.map((job) => job.payload?.sigunguCode).filter((code) => typeof code === 'string' && /^\d{5}$/.test(code));
};

// 다 채운 시군구의 대기 작업 → SUCCEEDED. 이번 실행이 시작되기 전에 만든 작업만(그 뒤 작업은 이번 잇기를 못 거쳤을 수 있다)
export const completeBackfillJobs = async (sigunguCodes, { startedAt }) => {
  let completed = 0;
  for (const sigunguCode of sigunguCodes) {
    const result = await prisma.job.updateMany({
      where: { ...pendingFor(sigunguCode), createdAt: { lt: startedAt } },
      data: { status: 'SUCCEEDED', result: { sigunguCode, completedAt: new Date().toISOString() } },
    });
    completed += result.count;
  }
  return completed;
};
