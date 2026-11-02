import { prisma } from '../../platform/prismaClient.js';

// api-contract.md 8장 "작업(Job)" 응답 모양. 관리자 작업 목록(admin)도 같은 모양을 쓴다.
export const toJobResponse = (job) => ({
  id: job.id,
  type: job.type,
  status: job.status,
  payload: job.payload ?? null,
  result: job.result ?? null,
  error: job.error ?? null,
  attempts: job.attempts,
  requestedById: job.requestedById,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
});

// 요청한 사용자 본인 또는 ADMIN만 볼 수 있다. 그 밖은 null → controller가 404.
export const findJobForUser = async (user, jobId) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.requestedById !== user.id && user.role !== 'ADMIN') return null;
  return toJobResponse(job);
};
