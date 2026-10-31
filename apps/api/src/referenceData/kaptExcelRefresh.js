// 최신 K-apt 엑셀을 받아 적재한다. 이미 넣은 날짜면 받지 않는다. CLI(refreshKaptBasis)와 Vercel cron이 함께 쓴다.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runKaptExcelImport } from './kaptExcel.js';
import { downloadLatestKaptExcel } from './kaptExcelDownload.js';
import { findDeltaCursorDate, SOURCES } from './referenceImports.js';

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
