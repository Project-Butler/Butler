// 드리프트 점검(월 1회, 선택): 건물DB 전체분으로 다시 적재하면 나올 연결과 지금 juso_building_links를 비교한다(쓰기 없음).
// 실행: npm run juso-link:drift -w apps/api -- <건물DB_전체분.zip 또는 풀어 둔 폴더>
// 차이 비율이 0.5%를 넘으면 import:juso-buildings(전체분 적재)로 다시 맞추라고 안내한다.
import '../src/loadEnv.js';
import { runJusoDrift } from '../src/referenceData/jusoLinkDrift.js';
import { prisma } from '../src/platform/prismaClient.js';
import { readPathArg, toUsageError } from './referenceDataArgs.js';

const main = async () => {
  const sourcePath = readPathArg(process.argv.slice(2), []);
  if (!sourcePath) throw toUsageError('건물DB 전체분 경로가 필요합니다: npm run juso-link:drift -- <zip 또는 폴더>');
  const startedAt = Date.now();
  const result = await runJusoDrift({ prisma, sourcePath, log: (message) => console.info('[juso-link:drift]', message) });
  console.info('[juso-link:drift] 끝', JSON.stringify({ ...result, ms: Date.now() - startedAt }, null, 2));
  console.info(
    result.reloadRecommended
      ? `차이 ${(result.ratio * 100).toFixed(2)}% > 0.5% — import:juso-buildings로 전체분을 다시 적재하세요.`
      : `차이 ${(result.ratio * 100).toFixed(2)}% — 다시 적재하지 않아도 됩니다.`,
  );
};

main()
  .catch((error) => {
    console.error('[juso-link:drift] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
