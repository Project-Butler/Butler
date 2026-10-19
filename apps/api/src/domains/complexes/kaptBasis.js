// K-apt 기본정보(getAphusBassInfoV5)로 kapt_complexes의 주소 칸(도로명·지번 원문과 파싱 결과)을 채운다.
// 부르는 곳: 백필 스크립트(prisma/backfillKaptBasis.js), 주간 cron(동기화 뒤 남은 시간),
// 단지 resolve(publicProvider.getKaptComplex — 받은 값을 그대로 저장해 호출을 아낀다).
// 모든 호출은 external_api_usage 카운터(apiUsage.js)를 거친다.
import { KAPT_BASIS_API, spendApiCall } from './apiUsage.js';
import { parseJibunLot, parseRoadAddress } from './kaptAddress.js';
import { ExternalServiceError } from './provider/ExternalServiceError.js';
import { fetchJson, readDataGoKrBody } from './provider/publicApi.js';

const KAPT_BASIS_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5';

// 실패가 이 횟수 이상인 단지는 자동 채우기(백필·cron) 대상에서 뺀다(수동 재시도만).
export const MAX_BASIS_ATTEMPTS = 3;
// data.go.kr는 몰아 부르면 429를 주거나, 수십 건을 빠르게 부른 뒤 30초가량 모든 요청에 게이트웨이 오류 '04'를 준다
// (2026-10-20 실측: 4개 동시 호출 → 429, 초당 3~8회 → 30~40건 뒤 04). 한 번에 하나씩 간격을 두고 부르고,
// 그런 응답을 받으면 쉬었다가(30초 → 60초 → 120초) 같은 단지를 다시 부르며, 이후 호출 간격을 두 배로 늘린다.
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_MIN_INTERVAL_MS = 300;
const MAX_INTERVAL_MS = 5000;
const DEFAULT_THROTTLE_PAUSE_MS = 30000;
const MAX_THROTTLE_RETRIES = 3;
// 실패가 이만큼 이어지면 남은 행을 부르지 않고 멈춘다(키 오류·장애).
const MAX_CONSECUTIVE_FAILURES = 20;
const BASIS_ERROR_MAX_LENGTH = 200;

export const fetchKaptBasis = async (kaptCode) => {
  const json = await fetchJson('kapt-basis', KAPT_BASIS_URL, {
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
    kaptCode,
  });
  const body = readDataGoKrBody('kapt-basis', json);
  const item = body?.item;
  // 없는 kaptCode는 모든 값이 null인 item으로 온다.
  if (!item || !item.kaptCode) return null;
  return item;
};

const trimOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

// 'OK'(도로명 파싱 성공) | 'EMPTY'(도로명주소 없음) | 'UNPARSEABLE'(형식이 맞지 않음)
export const toRoadParseStatus = (roadAddress, parsed) => {
  if (!roadAddress) return 'EMPTY';
  return parsed ? 'OK' : 'UNPARSEABLE';
};

// 기본정보 item → kapt_complexes에 쓸 칸
export const toKaptBasisColumns = (item, legalDongCode, now) => {
  const roadAddress = trimOrNull(item.doroJuso);
  const jibunAddress = trimOrNull(item.kaptAddr);
  const road = parseRoadAddress(roadAddress, legalDongCode);
  const lot = parseJibunLot(jibunAddress);
  return {
    roadAddress,
    jibunAddress,
    roadSigunguCd: road?.sigunguCd ?? null,
    roadNameKey: road?.roadNameKey ?? null,
    roadUnderground: road ? road.underground : null,
    roadMainNo: road?.mainNo ?? null,
    roadSubNo: road ? road.subNo : null,
    // 산 번지는 juso 번지 키(산 제외)와 섞이지 않게 비워 둔다. 원문(jibunAddress)은 그대로 남아 PNU 계산에 쓴다.
    mainLot: lot && !lot.isMountain ? lot.mainLot : null,
    subLot: lot && !lot.isMountain ? lot.subLot : null,
    basisFetchedAt: now,
    basisError: null,
  };
};

// resolve 등에서 이미 받은 기본정보를 저장한다(추가 호출 없음). kapt_complexes에 없는 코드면 아무것도 안 한다.
export const saveKaptBasis = async (prisma, kaptCode, item, now = new Date()) => {
  const row = await prisma.kaptComplex.findUnique({ where: { kaptCode }, select: { legalDongCode: true } });
  if (!row) return null;
  const columns = toKaptBasisColumns(item, row.legalDongCode, now);
  await prisma.kaptComplex.update({ where: { kaptCode }, data: columns });
  return columns;
};

// basis_error에 남길 짧은 사유. 원본 메시지(URL·키가 섞일 수 있음)는 넣지 않는다.
const toFailureReason = (error) => {
  if (error instanceof ExternalServiceError) return error.reason;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (error instanceof TypeError && error.message === 'fetch failed') return 'network error';
  return 'internal error';
};

// 하루 한도 초과면 남은 행을 계속 부르지 않는다.
const isQuotaError = (reason) => reason.endsWith('gateway 22');
// 쉬었다 다시 부를 응답(초당 한도·잠시 차단)
const isThrottled = (error) =>
  error instanceof ExternalServiceError && /(?:HTTP 429|gateway 04)$/.test(error.reason);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const recordFailure = async (prisma, kaptCode, reason) => {
  await prisma.kaptComplex.update({
    where: { kaptCode },
    data: { basisAttempts: { increment: 1 }, basisError: reason.slice(0, BASIS_ERROR_MAX_LENGTH) },
  });
};

// 아직 채우지 않은 단지(basis_fetched_at IS NULL, 실패 3회 미만)를 kapt_code 순서로 채운다.
// 중간에 멈춰도 다음 실행이 이어서 한다. 멈추는 조건(먼저 닿는 쪽):
//   maxRows개 처리 / 오늘 사용량이 usageLimit에 닿음 / deadlineAt 지남(새 호출을 시작하지 않음) /
//   하루 한도 초과 응답 / 쉬었다 불러도 계속 차단 / 실패가 계속 이어짐
// onProgress(summary)는 한 행을 끝낼 때마다 불린다(진행 표시용).
export const fillKaptBasis = async ({
  prisma,
  maxRows,
  usageLimit,
  deadlineAt = Infinity,
  concurrency = DEFAULT_CONCURRENCY,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  throttlePauseMs = DEFAULT_THROTTLE_PAUSE_MS,
  onProgress = () => {},
  now = () => new Date(),
}) => {
  const rows = await prisma.kaptComplex.findMany({
    where: { basisFetchedAt: null, basisAttempts: { lt: MAX_BASIS_ATTEMPTS }, isActive: true },
    select: { kaptCode: true, legalDongCode: true, sidoName: true },
    orderBy: { kaptCode: 'asc' },
    take: maxRows,
  });

  const summary = {
    candidates: rows.length,
    processed: 0,
    filled: 0,
    failed: 0,
    notFound: 0,
    throttlePauses: 0,
    intervalMs: minIntervalMs,
    road: { OK: 0, EMPTY: 0, UNPARSEABLE: 0 },
    unparseableBySido: {},
    noLot: 0,
    lastUsage: null,
    stopReason: null,
  };
  let nextIndex = 0;
  let consecutiveFailures = 0;
  let nextStartAt = 0;
  let intervalMs = minIntervalMs;

  const stop = (reason) => {
    if (!summary.stopReason) summary.stopReason = reason;
  };

  // 여러 worker가 같이 써도 호출 시작 간격이 minIntervalMs 이상 되게 순서를 잡는다.
  const waitForTurn = async () => {
    const startAt = Math.max(Date.now(), nextStartAt);
    nextStartAt = startAt + intervalMs;
    if (startAt > Date.now()) await sleep(startAt - Date.now());
  };

  // 사용량을 1 올리고 부른다. 결과: { item } | { stopped: true }(상한·마감이라 부르지 않음)
  // 차단 응답이면 모든 worker를 쉬게 하고 같은 단지를 다시 부른다. 그래도 차단이면 그 에러를 던진다.
  const fetchWithBudget = async (kaptCode) => {
    for (let retry = 0; ; retry += 1) {
      if (Date.now() >= deadlineAt) {
        stop('deadline');
        return { stopped: true };
      }
      const usage = await spendApiCall(prisma, KAPT_BASIS_API, usageLimit, now());
      if (usage === null) {
        stop('daily limit');
        return { stopped: true };
      }
      summary.lastUsage = Math.max(summary.lastUsage ?? 0, usage);
      try {
        return { item: await fetchKaptBasis(kaptCode) };
      } catch (error) {
        if (!isThrottled(error) || retry >= MAX_THROTTLE_RETRIES) throw error;
        // 쉬는 동안 마감이 지나면(주간 cron) 실패로 남기지 않고 멈춘다.
        const pauseMs = throttlePauseMs * 2 ** retry;
        if (Date.now() + pauseMs >= deadlineAt) {
          stop('deadline');
          return { stopped: true };
        }
        summary.throttlePauses += 1;
        intervalMs = Math.min(Math.max(intervalMs * 2, 1), MAX_INTERVAL_MS);
        summary.intervalMs = intervalMs;
        nextStartAt = Math.max(nextStartAt, Date.now() + pauseMs);
        await sleep(pauseMs);
      }
    }
  };

  // 반환값 false = 부르지 않았거나 한도·차단으로 멈춤(처리 수에 넣지 않는다)
  const processRow = async (row) => {
    let result;
    try {
      result = await fetchWithBudget(row.kaptCode);
    } catch (error) {
      const reason = toFailureReason(error);
      // 하루 한도·계속 차단은 단지 탓이 아니다. 실패 수를 올리지 않고 그 행을 다음 실행에 남긴 채 멈춘다.
      if (isQuotaError(reason)) {
        stop(`quota: ${reason}`);
        return false;
      }
      if (isThrottled(error)) {
        stop(`throttled: ${reason}`);
        return false;
      }
      await recordFailure(prisma, row.kaptCode, reason);
      summary.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) stop(`consecutive failures: ${reason}`);
      return true;
    }
    if (result.stopped) return false;
    consecutiveFailures = 0;

    if (!result.item) {
      await recordFailure(prisma, row.kaptCode, 'not found');
      summary.notFound += 1;
      return true;
    }

    const columns = toKaptBasisColumns(result.item, row.legalDongCode, now());
    await prisma.kaptComplex.update({ where: { kaptCode: row.kaptCode }, data: columns });
    summary.filled += 1;

    const status = toRoadParseStatus(columns.roadAddress, columns.roadNameKey !== null);
    summary.road[status] += 1;
    if (status === 'UNPARSEABLE') {
      const sido = row.sidoName ?? 'unknown';
      summary.unparseableBySido[sido] = (summary.unparseableBySido[sido] ?? 0) + 1;
    }
    if (columns.mainLot === null) summary.noLot += 1;
    return true;
  };

  const worker = async () => {
    while (!summary.stopReason && nextIndex < rows.length) {
      const row = rows[nextIndex];
      nextIndex += 1;

      await waitForTurn();
      if ((await processRow(row)) === false) return;
      summary.processed += 1;
      onProgress(summary);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (!summary.stopReason) summary.stopReason = rows.length < maxRows ? 'no more rows' : 'max rows';
  return summary;
};
