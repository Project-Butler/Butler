// K-apt 최신 기본정보 엑셀을 받아 kapt_complexes 기본정보 칸 + kapt_address_links(KAPT_EXCEL)를 갱신한다. 이미 넣은 날짜면 끝낸다.
// 실행: npm run refresh:kapt-basis -w apps/api
// 서버에 묶이지 않게 스케줄은 코드 밖(crontab 등)에 둔다. 필요한 것은 Node와 DATABASE_URL·DIRECT_URL뿐이고, 실패하면 종료 코드 1.
import '../src/loadEnv.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runKaptExcelImport } from '../src/referenceData/kaptExcel.js';
import { downloadLatestKaptExcel } from '../src/referenceData/kaptExcelDownload.js';
import { findDeltaCursorDate, SOURCES } from '../src/referenceData/referenceImports.js';
import { prisma } from '../src/platform/prismaClient.js';

const log = (line) => console.info(`[refresh:kapt-basis] ${line}`);

const main = async () => {
  const lastFileDate = await findDeltaCursorDate(prisma, SOURCES.KAPT_EXCEL);
  const destDir = await mkdtemp(path.join(tmpdir(), 'kapt-basis-'));
  try {
    const file = await downloadLatestKaptExcel({ destDir, lastFileDate });
    if (!file) {
      log(`새 파일 없음(마지막 적재 ${lastFileDate})`);
      return;
    }
    log(`받음 ${file.fileDate}`);
    const result = await runKaptExcelImport({ prisma, filePath: file.filePath, fileDate: file.fileDate, log });
    log(`끝 ${JSON.stringify(result)}`);
  } finally {
    await rm(destDir, { recursive: true, force: true });
  }
};

main()
  .catch((error) => {
    console.error('[refresh:kapt-basis] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
