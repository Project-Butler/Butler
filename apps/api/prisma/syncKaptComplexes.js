// K-apt 전국 단지 목록(kapt_complexes) 수동 동기화. 새 환경의 첫 채우기와 수동 갱신용이고,
// 평소에는 매주 Vercel Cron(GET /api/cron/kapt-complexes)이 같은 함수를 부른다. 자세한 내용은 seed-data/README.md.
// 실행: npm run sync:kapt -w apps/api (여러 번 실행해도 건수는 늘지 않는다)
// Prisma Client는 generate 시점에 .env가 없으면 .env를 읽지 않으므로(npm install 직후 등) 직접 읽는다.
import '../src/loadEnv.js';
import { syncKaptComplexes } from '../src/domains/complexes/kaptSync.js';
import { prisma } from '../src/platform/prismaClient.js';

syncKaptComplexes({ prisma })
  .then((summary) => {
    if (summary.skipped === true) {
      console.info(`[sync:kapt] 건너뜀 — ${summary.reason}(이미 실행 중인 동기화가 있다).`);
      return;
    }
    console.info(
      `[sync:kapt] 전국 ${summary.fetched}건(건너뜀 ${summary.skipped}) — 추가 ${summary.inserted}, 변경 ${summary.updated}, 비활성 ${summary.deactivated}, ${summary.durationMs}ms.`,
    );
  })
  .catch((error) => {
    console.error('[sync:kapt] 실패:', error.reason ?? error.name);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
