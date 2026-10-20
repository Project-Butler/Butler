// K-apt 기본정보 엑셀 → kapt_complexes 기본정보 칸 + kapt_address_links(KAPT_EXCEL). 처음 적재·분기 재적재(A팀 로컬).
// 실행: npm run import:kapt-basis -w apps/api -- <엑셀.xlsx> [--file-date YYYY-MM-DD]
// --file-date: 엑셀 추출일(기본: 파일 수정 날짜). 순서와 Supabase 접속 규칙은 README "참고 데이터 처음 적재".
import '../src/loadEnv.js';
import { stat } from 'node:fs/promises';
import { formatDateKST } from '../src/platform/dateUtils.js';
import { runKaptExcelImport } from '../src/referenceData/kaptExcel.js';
import { prisma } from '../src/platform/prismaClient.js';
import { readOption, readPathArg, toUsageError } from './referenceDataArgs.js';

const main = async () => {
  const argv = process.argv.slice(2);
  const filePath = readPathArg(argv, ['--file-date']);
  if (!filePath) throw toUsageError('엑셀 파일 경로가 필요합니다: npm run import:kapt-basis -- <파일.xlsx>');
  const fileDate = readOption(argv, '--file-date') ?? formatDateKST((await stat(filePath)).mtime);
  const result = await runKaptExcelImport({ prisma, filePath, fileDate, log: (line) => console.info(`[import:kapt-basis] ${line}`) });
  console.info('[import:kapt-basis] 끝', JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error('[import:kapt-basis] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
