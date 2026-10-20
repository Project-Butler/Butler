// K-apt 기본정보(도로명·지번주소·분양형태 등)를 채우는 로컬 재개형 스크립트. 처음 적재에서는 엑셀(import:kapt-basis)에 없는
// 단지만 남아 있다(basis_fetched_at IS NULL). 채운 단지의 도로명 키는 kapt_address_links(KAPT_API)에 쓰고, 끝에 단지 kaptCode를 다시 채운다.
// K-apt 기본정보 API는 개발계정 하루 5,000회라 하루 4,500회(기본값)까지만 부르고 멈춘다.
// 다음 날 다시 실행하면 채우지 않은 단지(basis_fetched_at IS NULL, 실패 3회 미만)부터 이어서 한다.
// 실행: npm run backfill:kapt-basis -w apps/api -- --limit 4500 [--interval-ms 2000]
// --interval-ms: 호출 시작 간격(기본 2000ms). 300ms로는 30~40건 뒤 게이트웨이가 몇 분간 막았고(04), 2000ms는 200건 내내 막히지 않았다(2026-10-20 실측).
// 막히면 스스로 쉬고(30·60·120초) 간격을 늘린다.
// Prisma Client는 generate 시점에 .env가 없으면 .env를 읽지 않으므로(npm install 직후 등) 직접 읽는다.
import '../src/loadEnv.js';
import { getApiUsage, KAPT_BASIS_API, KAPT_BASIS_BACKFILL_LIMIT } from '../src/domains/complexes/apiUsage.js';
import { fillKaptBasis } from '../src/domains/complexes/kaptBasis.js';
import { refillComplexKaptCodes } from '../src/domains/referenceData/complexKaptCodes.js';
import { prisma } from '../src/platform/prismaClient.js';

const PROGRESS_EVERY = 100;
const DEFAULT_INTERVAL_MS = 2000;

// 실행 방법이 틀린 경우의 에러. 문구를 그대로 보여 준다.
const toUsageError = (message) => Object.assign(new Error(message), { reason: message });

const parseIntArg = (argv, name, fallback, min) => {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < min) throw toUsageError(`${name}은 ${min} 이상의 정수여야 합니다.`);
  return value;
};

const main = async () => {
  if (!process.env.DATA_GO_KR_SERVICE_KEY) throw toUsageError('DATA_GO_KR_SERVICE_KEY가 없습니다.');
  const argv = process.argv.slice(2);
  const limit = parseIntArg(argv, '--limit', KAPT_BASIS_BACKFILL_LIMIT, 1);
  const intervalMs = parseIntArg(argv, '--interval-ms', DEFAULT_INTERVAL_MS, 0);
  const startedAt = Date.now();
  const usageBefore = await getApiUsage(prisma, KAPT_BASIS_API);
  console.info(`[backfill:kapt-basis] 최대 ${limit}건, 오늘 사용량 ${usageBefore}/${KAPT_BASIS_BACKFILL_LIMIT}`);

  const summary = await fillKaptBasis({
    prisma,
    maxRows: limit,
    usageLimit: KAPT_BASIS_BACKFILL_LIMIT,
    minIntervalMs: intervalMs,
    onProgress: (progress) => {
      if (progress.processed % PROGRESS_EVERY !== 0) return;
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.info(
        `[backfill:kapt-basis] ${progress.processed}/${progress.candidates} — 채움 ${progress.filled}, 실패 ${progress.failed + progress.notFound}, 사용량 ${progress.lastUsage}, 간격 ${progress.intervalMs}ms, ${seconds}s`,
      );
    },
  });

  const refilled = await refillComplexKaptCodes(prisma, summary.linkKeys);
  const [{ remaining }] = await prisma.$queryRaw`
    SELECT count(*)::int AS remaining FROM kapt_complexes
    WHERE basis_fetched_at IS NULL AND basis_attempts < 3 AND is_active`;
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const fillRate = summary.processed > 0 ? ((summary.filled / summary.processed) * 100).toFixed(1) : '0.0';
  const unparseableRate = summary.filled > 0 ? ((summary.road.UNPARSEABLE / summary.filled) * 100).toFixed(1) : '0.0';

  console.info(`[backfill:kapt-basis] 끝 — ${summary.stopReason}, ${seconds}s`);
  console.info(
    `  처리 ${summary.processed}(쉼 ${summary.throttlePauses}회, 마지막 간격 ${summary.intervalMs}ms): 채움 ${summary.filled}(${fillRate}%), 실패 ${summary.failed}, 없음 ${summary.notFound}, 남은 단지 ${remaining}`,
  );
  console.info(
    `  도로명 OK ${summary.road.OK}, EMPTY ${summary.road.EMPTY}, UNPARSEABLE ${summary.road.UNPARSEABLE}(${unparseableRate}%), 번지 없음 ${summary.noLot}`,
  );
  if (summary.road.UNPARSEABLE > 0) console.info('  UNPARSEABLE 시도별', summary.unparseableBySido);
  console.info(`  KAPT_API 연결 ${summary.linkKeys.length}행, 단지 kaptCode 바뀜 ${refilled}`);
  console.info(`  오늘 사용량 ${await getApiUsage(prisma, KAPT_BASIS_API)}`);
};

main()
  .catch((error) => {
    // Prisma 등 원본 메시지에는 접속 정보가 섞일 수 있어서 사유·코드만 남긴다(입력 검사 에러는 reason에 문구를 둔다).
    console.error('[backfill:kapt-basis] 실패:', error.reason ?? error.code ?? 'internal error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
