// 외부 API 상태 점검(주간 cron, 단지 목록 동기화 뒤). 고정 표본 3건으로 juso·K-apt 기본정보를
// 한 번씩 불러 결과를 jobs(type EXTERNAL_API_HEALTH)에 남기고, 직전 점검도 실패였으면(2회 연속) 경보 로그를 남긴다.
// K-apt 기본정보는 하루 한도가 있어서 1회만, 사용량 카운터(apiUsage.js)를 거쳐 부른다.
// juso 변동: 지금 쓰는 출처(공식 연계 모드에 따라 JUSO_DELTA 또는 JUSO_LINK)의 마지막 성공 날짜가
// 오늘(KST)보다 3일 넘게 지났으면 STALE(매일 cron이 멈췄거나 파일이 빠짐).
// STALE은 경보 로그와 결과에만 남기고 점검 성공·실패에는 넣지 않는다(외부 API 상태와 별개).
import { KAPT_BASIS_API, KAPT_BASIS_CRON_LIMIT, spendApiCall } from '../complexes/apiUsage.js';
import { fetchKaptBasis } from '../complexes/kaptBasis.js';
import { ExternalServiceError } from '../complexes/provider/ExternalServiceError.js';
import { healthProbes } from '../complexes/provider/publicProvider.js';
import { activeJusoSource, getJusoLinkMode } from '../../referenceData/jusoLinkMode.js';
import { findDeltaCursorDate } from '../../referenceData/referenceImports.js';
import { formatDateKST } from '../../platform/dateUtils.js';

export const EXTERNAL_API_HEALTH_JOB_TYPE = 'EXTERNAL_API_HEALTH';

// 정답을 사람이 확인한 표본(2026-10-20).
export const HEALTH_SAMPLES = [
  {
    name: '잠실파크리오',
    kaptCode: 'A13824006',
    jusoKeyword: '서울특별시 송파구 올림픽로 435',
  },
  {
    name: '가평읍내',
    kaptCode: 'A47771105',
    jusoKeyword: '경기도 가평군 가평읍 가화로 142-26',
  },
  {
    name: '중계그린',
    kaptCode: 'A13986306',
    jusoKeyword: '서울특별시 노원구 섬밭로 285',
  },
];

// 이번 점검이 실패했고 직전에 끝난 점검도 실패였을 때만 경보. 직전 점검이 없거나(첫 실행) 끝나지 않은 행이면 경보하지 않는다.
export const shouldAlertConsecutiveFailure = (currentFailed, previousJob) =>
  currentFailed === true && previousJob?.status === 'FAILED';

export const DELTA_STALE_DAYS = 3;

// lastFileDate·today: 'YYYY-MM-DD'. 성공한 변동분이 없으면(전체분 적재 전) STALE.
export const isDeltaStale = (lastFileDate, today) => {
  if (!lastFileDate) return true;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastFileDate}T00:00:00Z`)) / 86_400_000;
  return days > DELTA_STALE_DAYS;
};

// 지금 표에 쓰는 출처(모드 apply면 공식 연계, 아니면 건물DB 일변동분)의 커서를 본다.
export const checkDeltaFreshness = async (prisma, mode = getJusoLinkMode()) => {
  const source = activeJusoSource(mode);
  const lastFileDate = await findDeltaCursorDate(prisma, source);
  const stale = isDeltaStale(lastFileDate, formatDateKST(new Date()));
  if (stale) console.error('[health] juso delta STALE', source, lastFileDate ?? 'none');
  return { source, lastFileDate, status: stale ? 'STALE' : 'OK' };
};

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

// 점검 중 예상 못 한 에러(DB 오류 등)가 나도 jobs 행을 PROCESSING으로 두지 않는다(finally에서 FAILED로 닫는다).
export const runExternalApiHealth = async ({ prisma }) => {
  const job = await prisma.job.create({
    data: { type: EXTERNAL_API_HEALTH_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: new Date() },
    select: { id: true },
  });
  let status = 'FAILED';
  let result = { error: 'internal error' };

  try {
    const [juso, kaptBasis] = await Promise.all([
      Promise.all(HEALTH_SAMPLES.map(checkJuso)),
      checkKaptBasis(prisma, HEALTH_SAMPLES[0]),
    ]);
    const apis = {
      juso: summarize(juso.map((outcome, index) => ({ name: HEALTH_SAMPLES[index].name, ...outcome }))),
      kaptBasis,
    };
    const failedApis = Object.entries(apis)
      .filter(([, api]) => !api.ok)
      .map(([api]) => api);
    const failed = failedApis.length > 0;

    const previous = await prisma.job.findFirst({
      where: { type: EXTERNAL_API_HEALTH_JOB_TYPE, id: { not: job.id }, status: { in: ['SUCCEEDED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    const alert = shouldAlertConsecutiveFailure(failed, previous);
    if (alert) console.error('[health] consecutive_failures=2', failedApis.join(','));

    const jusoDelta = await checkDeltaFreshness(prisma);
    status = failed ? 'FAILED' : 'SUCCEEDED';
    result = { apis, failedApis, alert, jusoDelta };
    return { status, failedApis, alert, jusoDelta };
  } finally {
    await prisma.job.update({ where: { id: job.id }, data: { status, result, lockedAt: null } });
  }
};
