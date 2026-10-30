// 공식 연계 전환(기준점 심기)·되돌리기. 모드는 바꾸지 않는다 — 끝나면 Vercel 환경 변수 JUSO_LINK_MODE를 바꾸라고 안내한다.
// 실행: npm run juso-link:cutover -w apps/api            (일변동분 → 공식 연계: shadow 결과 확인 뒤)
//       npm run juso-link:cutover -w apps/api -- --revert (공식 연계 → 일변동분)
// shadow 기록의 최근 연속 일수(설명 안 되는 차이 0건·unresolved 1% 미만)도 함께 보여 준다. 7일이 안 되면 --force 없이는 전환하지 않는다.
import '../src/loadEnv.js';
import { cutoverToJusoLink, revertToJusoDelta } from '../src/referenceData/jusoLinkCutover.js';
import { evaluateShadowStreak } from '../src/referenceData/jusoLinkShadow.js';
import { SOURCES } from '../src/referenceData/referenceImports.js';
import { prisma } from '../src/platform/prismaClient.js';

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv.includes('--revert')) {
    const result = await revertToJusoDelta(prisma);
    console.info('[juso-link:cutover] 되돌림', JSON.stringify(result, null, 2));
    console.info('다음: Vercel 환경 변수 JUSO_LINK_MODE를 shadow 또는 off로 바꾼다.');
    return;
  }

  const rows = await prisma.dataImport.findMany({
    where: { source: SOURCES.JUSO_LINK_SHADOW },
    orderBy: { fileDate: 'desc' },
    take: 30,
    select: { stats: true },
  });
  const streak = evaluateShadowStreak(rows.map((row) => row.stats));
  console.info('[juso-link:cutover] shadow 연속', JSON.stringify(streak));
  if (!streak.ready && !argv.includes('--force')) {
    console.error('shadow 비교가 7일 연속 기준을 넘지 않았습니다. 확인했으면 --force로 전환할 수 있습니다.');
    process.exitCode = 1;
    return;
  }
  const result = await cutoverToJusoLink(prisma);
  console.info('[juso-link:cutover] 전환', JSON.stringify(result, null, 2));
  console.info('다음: Vercel 환경 변수 JUSO_LINK_MODE=apply로 바꾼다(JUSO_LINK_API_KEY가 있어야 한다).');
};

main()
  .catch((error) => {
    console.error('[juso-link:cutover] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
