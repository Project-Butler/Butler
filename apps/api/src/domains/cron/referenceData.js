// 매일 cron(/api/cron/reference-data) — 한 번에 60초 안. 구간(시간 예산 기준 시각부터):
//   0~30초  juso 공식 연계 적용(승인키 JUSO_LINK_API_KEY). 날짜 범위를 한 번에 받아 날짜 순서대로, 세 자료가 다 있는 날만.
//           20초가 지나면 새로 받지 않고, 30초가 지나면 새 묶음을 시작하지 않고 PARTIAL.
//           하루 1번 실행, 재시도 없음 — 실패한 날짜는 성공 기록이 없으므로 다음 날 실행이 그 날짜부터 이어서 한다.
//   30~45초 새 K-apt 단지 기본정보 채우기(KAPT_API 연결·분양형태)
//   45~50초 바뀐 도로명 키의 단지 kaptCode 다시 채우기 + 24시간 지난 검색 저장본 삭제
//   50초    강제 중단(새 일을 시작하지 않는다)
// 시간 예산 기준은 요청이 핸들러에 들어온 시각 t0다. vercel.json이 모든 경로를 함수 하나로 보내서 cron은 몇 시간 전에
// 데워진 인스턴스에서 돌 수 있다 — 모듈 로드 시각으로 재면 모든 마감이 지난 것으로 보여 아무것도 안 하고 끝난다.
// 콜드 스타트 직후 첫 호출에서만 min(t0, BOOT_AT)을 쓴다(콜드 스타트 시간도 60초에 들어가므로).
import { formatDateKST, getNow } from '../../platform/dateUtils.js';
import { expireStaleAttempts as defaultExpireStaleAttempts } from '../../platform/ownershipVerification.js';
import { KAPT_BASIS_CRON_LIMIT } from '../complexes/apiUsage.js';
import { fillKaptBasis } from '../complexes/kaptBasis.js';
import { refillComplexKaptCodes } from '../../referenceData/complexKaptCodes.js';
import { applyJusoLinkDay, readJusoLinkDay } from '../../referenceData/jusoLinkApply.js';
import {
  classifyLinkResCode,
  downloadJusoLink,
  evaluateLinkDay,
  getJusoLinkApiKey,
  groupLinkFilesByDate,
  LINK_CODES,
  LINK_DOWNLOAD_TIMEOUT_MS,
  LINK_MAX_RANGE_DAYS,
} from '../../referenceData/jusoLinkResponse.js';
import { createKeySet } from '../../referenceData/jusoLinks.js';
import { addDays, findDeltaCursorDate, LOCK_KEYS, SOURCES, toDateValue } from '../../referenceData/referenceImports.js';

export const REFERENCE_DATA_JOB_TYPE = 'REFERENCE_DATA_DAILY';

export const PHASES = {
  linkDownloadCutoffMs: 20_000,
  linkEndMs: 30_000,
  basisEndMs: 45_000,
  hardStopMs: 50_000,
};
// 공식 연계 한 번 받기에 남아 있어야 할 최소 시간
const LINK_MIN_DOWNLOAD_MS = 1_000;
// 모듈 로드와 첫 호출 사이가 이보다 길면 콜드 스타트 직후로 보지 않는다.
export const COLD_START_MAX_MS = 15_000;

const BASIS_FILL_MAX_ROWS = 30;
const BASIS_FILL_MIN_INTERVAL_MS = 1500;
// 검색 저장본 보관 기간(resolve가 읽는 기간과 같음)
const SEARCH_RESULT_RETENTION_HOURS = 24;

// 시간 예산 기준 시각
export const resolveBudgetBase = ({ t0, bootAt, coldStart }) =>
  coldStart && t0 >= bootAt && t0 - bootAt < COLD_START_MAX_MS ? bootAt : t0;

const toReason = (error) => error?.reason ?? error?.code ?? (error?.name === 'TimeoutError' ? 'timeout' : 'internal error');

const recordLinkFailure = (prisma, date, error) =>
  prisma.dataImport.create({
    data: { source: SOURCES.JUSO_LINK, lockKey: LOCK_KEYS.JUSO, fileDate: toDateValue(date), status: 'FAILED', error, finishedAt: getNow() },
  });

// 공식 연계: 커서 다음 날짜부터 어제(KST)까지. 범위(최대 10일)를 한 번 받아 날짜 순서대로 적용한다.
// 세 자료가 다 있는 날만 적용하고, 하나라도 아직이면 그 날짜에서 멈춘다(최근 이틀은 실패로 치지 않음).
// failed: 받기·자료·적용이 실패해서 멈췄다(job을 FAILED로 남긴다). 아직 안 올라옴·시간 부족·전체분 적재 전은 실패가 아니다.
export const runLinkPhase = async ({ prisma, base, today, keySet, downloadLinkDays, readLinkDay = readJusoLinkDay, applyLinkDay }) => {
  const days = [];
  const ignoredDates = [];
  let stopReason = null;
  let failed = false;
  const fail = (reason) => {
    stopReason = reason;
    failed = true;
    console.error('[juso-link] 멈춤', reason);
  };
  while (!stopReason) {
    if (Date.now() >= base + PHASES.linkDownloadCutoffMs) {
      stopReason = 'download cutoff';
      break;
    }
    const partial = await prisma.dataImport.findFirst({
      where: { source: SOURCES.JUSO_LINK, status: 'PARTIAL' },
      orderBy: { startedAt: 'desc' },
      select: { fileDate: true },
    });
    const cursor = partial ? null : await findDeltaCursorDate(prisma, SOURCES.JUSO_LINK);
    if (!partial && !cursor) {
      stopReason = 'no baseline (run import:juso-buildings)';
      break;
    }
    const from = partial ? partial.fileDate.toISOString().slice(0, 10) : addDays(cursor, 1);
    const last = addDays(today, -1);
    if (from > last) {
      stopReason = 'up to date';
      break;
    }
    const plusRange = addDays(from, LINK_MAX_RANGE_DAYS - 1);
    const to = plusRange < last ? plusRange : last;

    let byDate;
    try {
      byDate = await downloadLinkDays(from, to, { deadlineAt: base + PHASES.linkDownloadCutoffMs });
    } catch (error) {
      fail(`download failed: ${toReason(error)}`);
      break;
    }
    // 범위보다 앞 날짜로 온 파일(늦게 온 재반영 등)은 지금 적용하지 않는다 — 결과에 남겨 사람이 보게 한다.
    for (const date of byDate.keys()) if (date < from && !ignoredDates.includes(date)) ignoredDates.push(date);

    for (let date = from; date <= to && !stopReason; date = addDays(date, 1)) {
      const state = evaluateLinkDay(byDate.get(date));
      if (state.status === 'failed') {
        await recordLinkFailure(prisma, date, state.reason);
        fail(`link failed: ${state.reason}`);
      } else if (state.status === 'waiting') {
        if (date >= addDays(today, -2)) {
          stopReason = `not published yet: ${date}`;
        } else {
          await recordLinkFailure(prisma, date, `file not found: ${state.missing.join(',')}`);
          fail(`file not found: ${date}`);
        }
      } else if (Date.now() >= base + PHASES.linkEndMs) {
        stopReason = 'time budget';
      } else {
        const read = await readLinkDay(byDate.get(date));
        const result = await applyLinkDay({ prisma, linkDate: date, ...read, deadlineAt: base + PHASES.linkEndMs, keySet });
        days.push({
          linkDate: date,
          status: result.status,
          reason: result.reason ?? null,
          lines: result.stats?.lines ?? null,
          unresolved: result.stats?.unresolvedCount ?? null,
        });
        if (result.status === 'FAILED') fail(`FAILED: ${result.reason}`);
        else if (result.status !== 'SUCCEEDED') stopReason = `${result.status}${result.reason ? `: ${result.reason}` : ''}`;
      }
    }
  }
  return { days, stopReason, failed, ...(ignoredDates.length ? { ignoredDates } : {}) };
};

// 세 자료요청 구분을 차례로 받아 날짜별로 묶는다. 호출마다 제한 시간을 마감까지 남은 시간으로 줄인다.
// 승인키 오류와 날짜가 없는 오류 응답은 날짜별로 묶을 수 없으므로 범위 전체 실패로 던진다(원래 응답코드를 남기려고).
const downloadLinkDaysWithKey = async (from, to, { deadlineAt = Infinity } = {}) => {
  const appKey = getJusoLinkApiKey();
  if (!appKey) throw Object.assign(new Error('no key'), { reason: 'JUSO_LINK_API_KEY missing' });
  const filesByCode = {};
  for (const cntcCode of [LINK_CODES.ROAD_NAME, LINK_CODES.ROAD_ADDRESS, LINK_CODES.BUILDING_DONG]) {
    const left = deadlineAt - Date.now();
    if (left < LINK_MIN_DOWNLOAD_MS) throw Object.assign(new Error('time budget'), { reason: 'time budget' });
    filesByCode[cntcCode] = await downloadJusoLink({ appKey, cntcCode, from, to, timeoutMs: Math.min(LINK_DOWNLOAD_TIMEOUT_MS, left) });
    const keyError = filesByCode[cntcCode].find((file) => classifyLinkResCode(file.resCode) === 'keyError');
    if (keyError) throw Object.assign(new Error('key error'), { reason: `key error ${keyError.resCode}` });
    const undated = filesByCode[cntcCode].find((file) => !file.fileDate && classifyLinkResCode(file.resCode) === 'error');
    if (undated) throw Object.assign(new Error('link error'), { reason: `${cntcCode} ${undated.resCode}` });
  }
  return groupLinkFilesByDate(filesByCode);
};

const defaultDeps = {
  downloadLinkDays: downloadLinkDaysWithKey,
  applyLinkDay: applyJusoLinkDay,
  readLinkDay: readJusoLinkDay,
  fillBasis: fillKaptBasis,
  refill: refillComplexKaptCodes,
  cleanupSearchResults: (prisma) =>
    prisma.$executeRaw`
      DELETE FROM address_caches WHERE fetched_at < now() - make_interval(hours => ${SEARCH_RESULT_RETENTION_HOURS}::int)`,
};

export const JUSO_REFRESH_JOB_TYPE = 'JUSO_REFRESH_MANUAL';
// 관리자 즉시 갱신을 연달아 누를 때 겹치지 않게: 이 시간 안의 PROCESSING 즉시 갱신이 있으면 거부한다.
export const JUSO_REFRESH_BUSY_MS = 2 * 60 * 1000;

export class JusoRefreshBusyError extends Error {
  constructor() {
    super('juso refresh already running');
    this.name = 'JusoRefreshBusyError';
  }
}

// 관리자 즉시 갱신(POST /api/v1/admin/reference-data/juso/refresh). 매일 cron의 juso 단계만 지금 한 번 돌린다.
// 커서 다음 날짜부터 어제(KST)까지 밀린 날을 적용하고, 바뀐 도로명 키의 단지 kaptCode를 다시 채운다.
// 같은 표 잠금·날짜별 성공 기록을 그대로 쓰므로 cron과 겹쳐도 같은 날을 두 번 적용하지 않는다(겹치면 'already running').
// jobs에 JUSO_REFRESH_MANUAL(요청한 관리자 id)로 남긴다.
export const runJusoRefreshNow = async ({ prisma, requestedBy = null, now = getNow, deps = {} }) => {
  const { downloadLinkDays, readLinkDay, applyLinkDay, refill } = { ...defaultDeps, ...deps };
  const busy = await prisma.job.findFirst({
    where: { type: JUSO_REFRESH_JOB_TYPE, status: 'PROCESSING', lockedAt: { gt: new Date(Date.now() - JUSO_REFRESH_BUSY_MS) } },
    select: { id: true },
  });
  if (busy) throw new JusoRefreshBusyError();

  const base = Date.now();
  const today = formatDateKST(now());
  const keySet = createKeySet();
  const job = await prisma.job.create({
    data: { type: JUSO_REFRESH_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: getNow(), requestedById: requestedBy },
    select: { id: true },
  });
  let status = 'FAILED';
  const result = { today, juso: null, complexKaptCodesChanged: 0 };
  try {
    try {
      result.juso = await runLinkPhase({ prisma, base, today, keySet, downloadLinkDays, readLinkDay, applyLinkDay });
    } catch (error) {
      console.error('[juso-refresh] 갱신 실패', toReason(error));
      result.juso = { error: toReason(error) };
    }
    if (keySet.size > 0) result.complexKaptCodesChanged = await refill(prisma, keySet.values());
    result.totalMs = Date.now() - base;
    status = result.juso?.error || result.juso?.failed ? 'FAILED' : 'SUCCEEDED';
    return { jobId: job.id, ...result };
  } finally {
    await prisma.job.update({ where: { id: job.id }, data: { status, result, lockedAt: null } });
  }
};

// 실패는 단계마다 잡아서 결과에 남긴다(한 단계가 실패해도 다음 단계는 돈다). jobs에 REFERENCE_DATA_DAILY로 남긴다.
export const runReferenceDataCron = async ({ prisma, t0, bootAt, coldStart, now = getNow, deps = {} }) => {
  // 멈춘 권리자 인증 시도 정리. 임시 생년월일 삭제가 걸려 있어 시간 예산에 밀리지 않게 맨 앞에서 따로 한다.
  const { expireStaleAttempts = defaultExpireStaleAttempts } = deps;
  let staleAttempts;
  try {
    staleAttempts = { expired: await expireStaleAttempts() };
  } catch (error) {
    console.error('[reference-data] 멈춘 인증 시도 정리 실패', toReason(error));
    staleAttempts = { error: toReason(error) };
  }

  const { downloadLinkDays, readLinkDay, applyLinkDay, fillBasis, refill, cleanupSearchResults } = { ...defaultDeps, ...deps };
  const base = resolveBudgetBase({ t0, bootAt, coldStart });
  const elapsedAtStart = Date.now() - base;
  const today = formatDateKST(now());
  const keySet = createKeySet();
  const result = { elapsedAtStart, today, staleAttempts, juso: null, basis: null, finalize: null };

  const job = await prisma.job.create({
    data: { type: REFERENCE_DATA_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: getNow(), payload: { elapsedAtStart } },
    select: { id: true },
  });
  let status = 'FAILED';
  try {
    try {
      const startedAt = Date.now();
      const phase = await runLinkPhase({ prisma, base, today, keySet, downloadLinkDays, readLinkDay, applyLinkDay });
      result.juso = { ...phase, ms: Date.now() - startedAt };
    } catch (error) {
      console.error('[reference-data] juso 단계 실패', toReason(error));
      result.juso = { error: toReason(error) };
    }

    if (Date.now() < base + PHASES.basisEndMs) {
      try {
        const summary = await fillBasis({
          prisma,
          maxRows: BASIS_FILL_MAX_ROWS,
          usageLimit: KAPT_BASIS_CRON_LIMIT,
          deadlineAt: base + PHASES.basisEndMs,
          minIntervalMs: BASIS_FILL_MIN_INTERVAL_MS,
        });
        for (const key of summary.linkKeys ?? []) keySet.add(key);
        result.basis = {
          processed: summary.processed,
          filled: summary.filled,
          failed: summary.failed + summary.notFound,
          links: summary.linkKeys?.length ?? 0,
          stopReason: summary.stopReason,
        };
      } catch (error) {
        console.error('[reference-data] 기본정보 채우기 실패', toReason(error));
        result.basis = { error: toReason(error) };
      }
    } else {
      result.basis = { skipped: 'time budget' };
    }

    if (Date.now() < base + PHASES.hardStopMs) {
      try {
        const complexKaptCodesChanged = keySet.size > 0 ? await refill(prisma, keySet.values()) : 0;
        const searchResultsDeleted = await cleanupSearchResults(prisma);
        result.finalize = { changedKeys: keySet.size, complexKaptCodesChanged, searchResultsDeleted };
      } catch (error) {
        console.error('[reference-data] 마무리 실패', toReason(error));
        result.finalize = { error: toReason(error) };
      }
    } else {
      result.finalize = { skipped: 'hard stop' };
    }

    result.totalMs = Date.now() - base;
    const failed = result.juso?.failed || [result.juso, result.basis, result.finalize].some((phase) => phase?.error);
    status = failed ? 'FAILED' : 'SUCCEEDED';
    return result;
  } finally {
    await prisma.job.update({ where: { id: job.id }, data: { status, result, lockedAt: null } });
  }
};
