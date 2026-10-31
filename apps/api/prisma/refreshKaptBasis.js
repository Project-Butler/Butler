// K-apt 최신 기본정보 엑셀을 받아 kapt_complexes 기본정보 칸 + kapt_address_links(KAPT_EXCEL)를 갱신한다. 이미 넣은 날짜면 끝낸다.
// 실행: npm run refresh:kapt-basis -w apps/api
// Vercel에서는 /api/cron/kapt-basis가 같은 함수를 부른다. 다른 서버에서는 crontab 등으로 이 명령만 부르면 된다(Node와 DATABASE_URL·DIRECT_URL, 실패하면 종료 코드 1).
import '../src/loadEnv.js';
import { refreshKaptBasis } from '../src/referenceData/kaptExcelRefresh.js';
import { prisma } from '../src/platform/prismaClient.js';

const main = async () => {
  const result = await refreshKaptBasis({ prisma, log: (line) => console.info(`[refresh:kapt-basis] ${line}`) });
  console.info('[refresh:kapt-basis] 끝', JSON.stringify(result));
};

main()
  .catch((error) => {
    console.error('[refresh:kapt-basis] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
