// 외부 API 상태 점검(주간 cron, 단지 목록 동기화·기본정보 채우기 뒤). 고정 표본 3건으로 juso·K-apt 기본정보·건축HUB를
// 한 번씩 불러 결과를 jobs(type EXTERNAL_API_HEALTH)에 남기고, 직전 점검도 실패였으면(2회 연속) 경보 로그를 남긴다.
// K-apt 기본정보는 하루 한도가 있어서 1회만, 사용량 카운터(apiUsage.js)를 거쳐 부른다.
import { KAPT_BASIS_API, KAPT_BASIS_CRON_LIMIT, spendApiCall } from '../complexes/apiUsage.js';
import { fetchKaptBasis } from '../complexes/kaptBasis.js';
import { ExternalServiceError } from '../complexes/provider/ExternalServiceError.js';
import { healthProbes } from '../complexes/provider/publicProvider.js';

export const EXTERNAL_API_HEALTH_JOB_TYPE = 'EXTERNAL_API_HEALTH';

// 정답을 사람이 확인한 표본(2026-10-20). pnu는 리 단위 법정동 코드 그대로의 19자리, 동·호는 대장 표기 그대로.
export const HEALTH_SAMPLES = [
  {
    name: '잠실파크리오',
    kaptCode: 'A13824006',
    jusoKeyword: '서울특별시 송파구 올림픽로 435',
    pnu: '1171010200100170000',
    dongNm: '101동',
    hoNm: '1203',
    exclusiveArea: 35.24,
  },
  {
    name: '가평읍내',
    kaptCode: 'A47771105',
    jusoKeyword: '경기도 가평군 가평읍 가화로 142-26',
    pnu: '4182025021102700000',
    dongNm: '105동',
    hoNm: '304호',
    exclusiveArea: 39.51,
  },
  {
    name: '중계그린',
    kaptCode: 'A13986306',
    jusoKeyword: '서울특별시 노원구 섬밭로 285',
    pnu: '1135010600105030000',
    dongNm: '114동',
    hoNm: '410호',
    exclusiveArea: 39.78,
  },
];

// 이번 점검이 실패했고 직전에 끝난 점검도 실패였을 때만 경보. 직전 점검이 없거나(첫 실행) 끝나지 않은 행이면 경보하지 않는다.
export const shouldAlertConsecutiveFailure = (currentFailed, previousJob) =>
  currentFailed === true && previousJob?.status === 'FAILED';

// 실패 사유(원본 메시지에 URL·키가 섞일 수 있어 짧은 사유만)
const toReason = (error) => {
  if (error instanceof ExternalServiceError) return error.reason;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (error instanceof TypeError && error.message === 'fetch failed') return 'network error';
  return 'internal error';
};

const check = async (fn) => {
  const startedAt = Date.now();
  try {
    const reason = await fn();
    return { ok: reason === null, ...(reason ? { reason } : {}), ms: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, reason: toReason(error), ms: Date.now() - startedAt };
  }
};

const checkJuso = (sample) =>
  check(async () => {
    const rows = await healthProbes.searchJuso(sample.jusoKeyword);
    return rows.some((row) => row.bdKdcd === '1') ? null : 'no apartment row';
  });

const checkBuildingHub = (sample) =>
  check(async () => {
    const area = await healthProbes.fetchExclusiveArea(sample.pnu, sample.dongNm, sample.hoNm);
    return area === sample.exclusiveArea ? null : `unexpected area ${area}`;
  });

// 하루 한도에 닿았으면 부르지 않고 skipped(실패로 치지 않음)
const checkKaptBasis = async (prisma, sample) => {
  if ((await spendApiCall(prisma, KAPT_BASIS_API, KAPT_BASIS_CRON_LIMIT)) === null) {
    return { ok: true, skipped: 'daily limit' };
  }
  return check(async () => {
    const item = await fetchKaptBasis(sample.kaptCode);
    return item?.kaptCode === sample.kaptCode ? null : 'not found';
  });
};

const summarize = (results) => ({
  ok: results.every((result) => result.ok),
  samples: results,
});

export const runExternalApiHealth = async ({ prisma }) => {
  const job = await prisma.job.create({
    data: { type: EXTERNAL_API_HEALTH_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: new Date() },
    select: { id: true },
  });

  const [juso, buildingHub, kaptBasis] = await Promise.all([
    Promise.all(HEALTH_SAMPLES.map(checkJuso)),
    Promise.all(HEALTH_SAMPLES.map(checkBuildingHub)),
    checkKaptBasis(prisma, HEALTH_SAMPLES[0]),
  ]);
  const apis = {
    juso: summarize(juso.map((result, index) => ({ name: HEALTH_SAMPLES[index].name, ...result }))),
    kaptBasis,
    buildingHub: summarize(buildingHub.map((result, index) => ({ name: HEALTH_SAMPLES[index].name, ...result }))),
  };
  const failedApis = Object.entries(apis)
    .filter(([, result]) => !result.ok)
    .map(([api]) => api);
  const failed = failedApis.length > 0;

  const previous = await prisma.job.findFirst({
    where: { type: EXTERNAL_API_HEALTH_JOB_TYPE, id: { not: job.id }, status: { in: ['SUCCEEDED', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });
  const alert = shouldAlertConsecutiveFailure(failed, previous);
  if (alert) console.error('[health] consecutive_failures=2', failedApis.join(','));

  const result = { apis, failedApis, alert };
  await prisma.job.update({
    where: { id: job.id },
    data: { status: failed ? 'FAILED' : 'SUCCEEDED', result, lockedAt: null },
  });
  return { status: failed ? 'FAILED' : 'SUCCEEDED', failedApis, alert };
};
