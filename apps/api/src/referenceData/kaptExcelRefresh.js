// 최신 K-apt 엑셀을 받아 적재한다. 이미 넣은 날짜면 받지 않는다. CLI(refreshKaptBasis)·Vercel cron·관리자 즉시 갱신이 함께 쓴다.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runKaptExcelImport } from './kaptExcel.js';
import { downloadLatestKaptExcel } from './kaptExcelDownload.js';
import { findDeltaCursorDate, ImportAlreadyRunningError, LOCK_KEYS, SOURCES } from './referenceImports.js';

export const KAPT_BASIS_REFRESH_JOB_TYPE = 'KAPT_BASIS_REFRESH_MANUAL';
// 관리자 즉시 갱신을 연달아 누를 때 겹치지 않게: 이 시간 안의 PROCESSING 즉시 갱신이 있으면 거부한다.
export const KAPT_BASIS_REFRESH_BUSY_MS = 2 * 60 * 1000;

// 결과: { status: 'SKIPPED', lastFileDate } | { status: 'SUCCEEDED', ...적재 통계 }
export const refreshKaptBasis = async ({ prisma, download = downloadLatestKaptExcel, runImport = runKaptExcelImport, log = () => {} }) => {
  const lastFileDate = await findDeltaCursorDate(prisma, SOURCES.KAPT_EXCEL);
  const destDir = await mkdtemp(path.join(tmpdir(), 'kapt-basis-'));
  try {
    const file = await download({ destDir, lastFileDate });
    if (!file) {
      log(`새 파일 없음(마지막 적재 ${lastFileDate})`);
      return { status: 'SKIPPED', lastFileDate };
    }
    log(`받음 ${file.fileDate}`);
    return { status: 'SUCCEEDED', ...(await runImport({ prisma, filePath: file.filePath, fileDate: file.fileDate, log })) };
  } finally {
    await rm(destDir, { recursive: true, force: true });
  }
};

// 관리자 즉시 갱신(POST /api/v1/admin/reference-data/kapt/refresh). jobs에 요청한 관리자 id로 남긴다.
// 적재는 같은 표 잠금을 쓰므로 cron·CLI와 겹치면 ImportAlreadyRunningError. 갱신 실패는 응답의 kapt.error와 job FAILED로 남긴다.
export const runKaptBasisRefreshNow = async ({ prisma, requestedBy = null, refresh = refreshKaptBasis }) => {
  const busy = await prisma.job.findFirst({
    where: { type: KAPT_BASIS_REFRESH_JOB_TYPE, status: 'PROCESSING', lockedAt: { gt: new Date(Date.now() - KAPT_BASIS_REFRESH_BUSY_MS) } },
    select: { id: true },
  });
  if (busy) throw new ImportAlreadyRunningError(LOCK_KEYS.KAPT_EXCEL);

  const startedAt = Date.now();
  const job = await prisma.job.create({
    data: { type: KAPT_BASIS_REFRESH_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: new Date(), requestedById: requestedBy },
    select: { id: true },
  });
  let status = 'FAILED';
  const result = { kapt: null };
  try {
    try {
      result.kapt = await refresh({ prisma });
      status = 'SUCCEEDED';
    } catch (error) {
      if (error instanceof ImportAlreadyRunningError) throw error;
      const reason = error.reason ?? error.code ?? 'internal error';
      console.error('[kapt-refresh] 갱신 실패', reason);
      result.kapt = { error: reason };
    }
    result.totalMs = Date.now() - startedAt;
    return { jobId: job.id, ...result };
  } finally {
    await prisma.job.update({ where: { id: job.id }, data: { status, result, lockedAt: null } });
  }
};
