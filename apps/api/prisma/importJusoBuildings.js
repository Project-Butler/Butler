// juso 건물DB 전체분 → juso_building_links 전체 적재(mark-and-sweep). 처음 적재·분기 재적재(A팀 로컬).
// 실행: npm run import:juso-buildings -w apps/api -- <전체분 zip 또는 압축 푼 폴더> [--file-date YYYY-MM-DD]
// --file-date: 전체분 기준일(기본: zip 안 안내 파일 "…년 …월 …일 기준" 또는 zip 이름 YYYYMM의 말일).
// 변동분이 RUNNING·PARTIAL이면 시작하지 않는다. 성공하면 변동분 커서를 기준일로 옮긴다(다음 변동분 = 기준일 다음 날).
// 먼저 sync:kapt → import:kapt-basis → backfill:kapt-basis를 끝낸다(K-apt 쪽 도로명주소·번지가 있어야 맞춘다).
import '../src/loadEnv.js';
import { runJusoFullLoad } from '../src/domains/referenceData/jusoFullLoad.js';
import { prisma } from '../src/platform/prismaClient.js';
import { readOption, readPathArg, toUsageError } from './referenceDataArgs.js';

const main = async () => {
  const argv = process.argv.slice(2);
  const sourcePath = readPathArg(argv, ['--file-date']);
  if (!sourcePath) throw toUsageError('전체분 zip 또는 폴더 경로가 필요합니다: npm run import:juso-buildings -- <경로>');
  const startedAt = Date.now();
  const result = await runJusoFullLoad({
    prisma,
    sourcePath,
    fileDate: readOption(argv, '--file-date'),
    log: (line) => console.info(`[import:juso-buildings] ${line} (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`),
  });
  const [{ rows, bytes }] = await prisma.$queryRaw`
    SELECT count(*)::int AS rows, pg_total_relation_size('juso_building_links')::bigint AS bytes FROM juso_building_links`;
  console.info('[import:juso-buildings] 끝', JSON.stringify({ ...result, tableRows: rows, tableBytes: Number(bytes) }, null, 2));
};

main()
  .catch((error) => {
    console.error('[import:juso-buildings] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
