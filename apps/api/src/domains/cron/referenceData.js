// 매일 cron(/api/cron/reference-data) — 한 번에 60초 안. 구간(시간 예산 기준 시각부터):
//   0~30초  juso 변동 적용(20초가 지나면 새 파일을 받지 않음, 30초가 지나면 새 묶음을 시작하지 않고 PARTIAL).
//           공식 연계 모드(JUSO_LINK_MODE, jusoLinkMode.js)에 따라:
//             off    건물DB 일변동분(JUSO_DELTA)
//             shadow 0~8초 공식 연계 비교(계획만, 하루치) → 건물DB 일변동분
//             apply  공식 연계(JUSO_LINK)만. 날짜 범위를 한 번에 받아 날짜 순서대로, 세 자료가 다 있는 날만 적용
//           하루 1번 실행, 재시도 없음 — 실패한 날짜는 성공 기록이 없으므로 다음 날 실행이 그 날짜부터 이어서 한다.
//   30~45초 새 K-apt 단지 기본정보 채우기(KAPT_API 연결·분양형태)
//   45~50초 바뀐 도로명 키의 단지 kaptCode 다시 채우기 + 24시간 지난 검색 저장본 삭제
//   50초    강제 중단(새 일을 시작하지 않는다)
// 시간 예산 기준은 요청이 핸들러에 들어온 시각 t0다. vercel.json이 모든 경로를 함수 하나로 보내서 cron은 몇 시간 전에
// 데워진 인스턴스에서 돌 수 있다 — 모듈 로드 시각으로 재면 모든 마감이 지난 것으로 보여 아무것도 안 하고 끝난다.
// 콜드 스타트 직후 첫 호출에서만 min(t0, BOOT_AT)을 쓴다(콜드 스타트 시간도 60초에 들어가므로).
import { formatDateKST } from '../../platform/dateUtils.js';
import { KAPT_BASIS_CRON_LIMIT } from '../complexes/apiUsage.js';
import { fillKaptBasis } from '../complexes/kaptBasis.js';
import {
  addDays,
  applyJusoDeltaFile,
  downloadJusoDelta,
  extractDeltaBuildingText,
  planDeltaFile,
} from '../../referenceData/jusoDelta.js';
import { evaluateDeltaGate, splitDeltaLines } from '../../referenceData/jusoDeltaApplier.js';
import { refillComplexKaptCodes } from '../../referenceData/complexKaptCodes.js';
import { applyJusoLinkDay, planJusoLinkDay, readJusoLinkDay } from '../../referenceData/jusoLinkApply.js';
import { getJusoLinkApiKey, getJusoLinkMode } from '../../referenceData/jusoLinkMode.js';
import {
  classifyLinkResCode,
  downloadJusoLink,
  evaluateLinkDay,
  groupLinkFilesByDate,
  LINK_CODES,
  LINK_DOWNLOAD_TIMEOUT_MS,
  LINK_MAX_RANGE_DAYS,
} from '../../referenceData/jusoLinkResponse.js';
import { compareShadowPlans } from '../../referenceData/jusoLinkShadow.js';
import { createKeySet } from '../../referenceData/jusoLinks.js';
import { findDeltaCursorDate, LOCK_KEYS, SOURCES, toDateValue, toLinkDate } from '../../referenceData/referenceImports.js';

export const REFERENCE_DATA_JOB_TYPE = 'REFERENCE_DATA_DAILY';

export const PHASES = {
  shadowEndMs: 8_000,
  deltaDownloadCutoffMs: 20_000,
  deltaEndMs: 30_000,
  basisEndMs: 45_000,
  hardStopMs: 50_000,
};
// 공식 연계 한 번 받기에 남아 있어야 할 최소 시간, shadow에서 일변동분 받기를 시작할 최소 시간
const LINK_MIN_DOWNLOAD_MS = 1_000;
const SHADOW_MIN_DELTA_DOWNLOAD_MS = 2_000;
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

// 변동분: 커서 다음 날짜부터, 받을 수 있는 날짜(어제 KST)까지. 파일 시각이 stdde 다음 날 06:58(KST)이라
// 04:00 KST cron에는 어제 파일이 아직 없다 → 어제·그제 날짜의 "없음"은 실패로 치지 않고 다음 실행에 맡긴다.
export const runDeltaPhase = async ({ prisma, base, today, keySet, download, applyFile }) => {
  const files = [];
  let stopReason = null;
  while (!stopReason) {
    if (Date.now() >= base + PHASES.deltaDownloadCutoffMs) {
      stopReason = 'download cutoff';
      break;
    }
    const partial = await prisma.referenceDataImport.findFirst({
      where: { source: SOURCES.JUSO_DELTA, status: 'PARTIAL' },
      orderBy: { startedAt: 'desc' },
      select: { fileDate: true },
    });
    const cursor = partial ? null : await findDeltaCursorDate(prisma);
    if (!partial && !cursor) {
      stopReason = 'no baseline';
      break;
    }
    // 공식 연계로 전환했다가 모드만 되돌린 경우: 공식 연계가 이미 적용한 날을 다시 적용하지 않는다.
    const linkCursor = cursor ? await findDeltaCursorDate(prisma, SOURCES.JUSO_LINK) : null;
    if (linkCursor && linkCursor > toLinkDate(cursor)) {
      stopReason = 'juso link cursor ahead (run juso-link:cutover -- --revert)';
      break;
    }
    const date = partial ? partial.fileDate.toISOString().slice(0, 10) : addDays(cursor, 1);
    if (date > addDays(today, -1)) {
      stopReason = 'up to date';
      break;
    }

    let downloaded;
    try {
      downloaded = await download(date);
    } catch (error) {
      stopReason = `download failed: ${toReason(error)}`;
      break;
    }
    if (!downloaded.found) {
      if (date >= addDays(today, -2)) {
        stopReason = `not published yet: ${date}`;
      } else {
        // 날짜를 건너뛰지 않는다 — 기록을 남기고 멈춘다(A팀 확인).
        await prisma.referenceDataImport.create({
          data: {
            source: SOURCES.JUSO_DELTA,
            lockKey: LOCK_KEYS.JUSO,
            fileDate: toDateValue(date),
            status: 'FAILED',
            error: 'file not found',
            finishedAt: new Date(),
          },
        });
        stopReason = `file not found: ${date}`;
      }
      break;
    }

    const result = await applyFile({
      prisma,
      fileDate: date,
      fileName: downloaded.fileName,
      buffer: downloaded.buffer,
      deadlineAt: base + PHASES.deltaEndMs,
      keySet,
    });
    files.push({ fileDate: date, status: result.status, reason: result.reason ?? null, lines: result.stats?.lines ?? null });
    if (result.status !== 'SUCCEEDED') stopReason = `${result.status}${result.reason ? `: ${result.reason}` : ''}`;
  }
  return { files, stopReason };
};

const recordLinkFailure = (prisma, date, error) =>
  prisma.referenceDataImport.create({
    data: { source: SOURCES.JUSO_LINK, lockKey: LOCK_KEYS.JUSO, fileDate: toDateValue(date), status: 'FAILED', error, finishedAt: new Date() },
  });

// 공식 연계(apply 모드): 커서 다음 날짜부터 어제(KST)까지. 범위(최대 10일)를 한 번 받아 날짜 순서대로 적용한다.
// 세 자료가 다 있는 날만 적용하고, 하나라도 아직이면 그 날짜에서 멈춘다(최근 이틀은 실패로 치지 않음).
export const runLinkPhase = async ({ prisma, base, today, keySet, downloadLinkDays, readLinkDay = readJusoLinkDay, applyLinkDay }) => {
  const days = [];
  const ignoredDates = [];
  let stopReason = null;
  const deltaCursor = await findDeltaCursorDate(prisma, SOURCES.JUSO_DELTA);
  while (!stopReason) {
    if (Date.now() >= base + PHASES.deltaDownloadCutoffMs) {
      stopReason = 'download cutoff';
      break;
    }
    const partial = await prisma.referenceDataImport.findFirst({
      where: { source: SOURCES.JUSO_LINK, status: 'PARTIAL' },
      orderBy: { startedAt: 'desc' },
      select: { fileDate: true },
    });
    const cursor = partial ? null : await findDeltaCursorDate(prisma, SOURCES.JUSO_LINK);
    if (!partial && !cursor) {
      stopReason = 'no baseline (run juso-link:cutover)';
      break;
    }
    // 전환 뒤 누가 일변동분을 손으로 더 적용했으면 공식 연계가 옛 날짜를 덮어쓰지 않게 멈춘다.
    if (cursor && deltaCursor && toLinkDate(deltaCursor) > cursor) {
      stopReason = 'juso delta cursor ahead (run juso-link:cutover again)';
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
      byDate = await downloadLinkDays(from, to, { deadlineAt: base + PHASES.deltaDownloadCutoffMs });
    } catch (error) {
      stopReason = `download failed: ${toReason(error)}`;
      break;
    }
    // 범위보다 앞 날짜로 온 파일(늦게 온 재반영 등)은 지금 적용하지 않는다 — 결과에 남겨 사람이 보게 한다.
    for (const date of byDate.keys()) if (date < from && !ignoredDates.includes(date)) ignoredDates.push(date);

    for (let date = from; date <= to && !stopReason; date = addDays(date, 1)) {
      const state = evaluateLinkDay(byDate.get(date));
      if (state.status === 'failed') {
        await recordLinkFailure(prisma, date, state.reason);
        stopReason = `link failed: ${state.reason}`;
      } else if (state.status === 'waiting') {
        if (date >= addDays(today, -2)) {
          stopReason = `not published yet: ${date}`;
        } else {
          await recordLinkFailure(prisma, date, `file not found: ${state.missing.join(',')}`);
          stopReason = `file not found: ${date}`;
        }
      } else if (Date.now() >= base + PHASES.deltaEndMs) {
        stopReason = 'time budget';
      } else {
        const read = await readLinkDay(byDate.get(date));
        const result = await applyLinkDay({ prisma, linkDate: date, ...read, deadlineAt: base + PHASES.deltaEndMs, keySet });
        days.push({
          linkDate: date,
          status: result.status,
          reason: result.reason ?? null,
          lines: result.stats?.lines ?? null,
          unresolved: result.stats?.unresolvedCount ?? null,
        });
        if (result.status !== 'SUCCEEDED') stopReason = `${result.status}${result.reason ? `: ${result.reason}` : ''}`;
      }
    }
  }
  return { days, stopReason, ...(ignoredDates.length ? { ignoredDates } : {}) };
};

// shadow 모드: 일변동분이 이번에 처음 적용할 날짜(stdde S)와 같은 변동(연계 기준일 S+1)을 두 경로로 계획만 해서 비교한다.
// 일변동분 적용 전에, 0~8초 안에서, 하루치만. 못 끝내면 incomplete로 남긴다(전환 기준 7일 연속에서 빠짐). 표에는 쓰지 않는다.
export const runShadowPhase = async ({ prisma, base, today, downloadLinkDays, downloadDelta, search }) => {
  const deadline = base + PHASES.shadowEndMs;
  const deltaCursor = await findDeltaCursorDate(prisma, SOURCES.JUSO_DELTA);
  if (!deltaCursor) return { skipped: 'no baseline' };
  const partial = await prisma.referenceDataImport.findFirst({
    where: { source: SOURCES.JUSO_DELTA, status: 'PARTIAL' },
    orderBy: { startedAt: 'desc' },
    select: { fileDate: true },
  });
  const deltaDate = partial ? partial.fileDate.toISOString().slice(0, 10) : addDays(deltaCursor, 1);
  if (deltaDate > addDays(today, -1)) return { skipped: 'up to date' };
  const linkDate = toLinkDate(deltaDate);
  const compared = await prisma.referenceDataImport.findMany({
    where: { source: SOURCES.JUSO_LINK_SHADOW, fileDate: toDateValue(linkDate) },
    select: { stats: true },
  });
  if (compared.some((row) => row.stats && row.stats.incomplete === false)) return { skipped: 'already compared', linkDate };

  const record = async (stats) => {
    await prisma.referenceDataImport.create({
      data: {
        source: SOURCES.JUSO_LINK_SHADOW,
        lockKey: LOCK_KEYS.JUSO_SHADOW,
        fileDate: toDateValue(linkDate),
        status: 'SUCCEEDED',
        stats: { linkDate, deltaDate, ...stats },
        finishedAt: new Date(),
      },
    });
    return { linkDate, deltaDate, ...stats };
  };
  const incomplete = (reason) => record({ incomplete: true, reason });
  if (partial) return incomplete('juso delta PARTIAL');

  try {
    // 받기 제한 시간도 비교 마감(8초) 안으로 줄인다 — 서버가 느려도 일변동분의 받기 시간(20초까지)을 먹지 않게.
    const byDate = await downloadLinkDays(linkDate, linkDate, { deadlineAt: deadline });
    const state = evaluateLinkDay(byDate.get(linkDate));
    if (state.status !== 'complete') return incomplete(`link ${state.status}${state.reason ? `: ${state.reason}` : ''}`);
    const left = deadline - Date.now();
    if (left < SHADOW_MIN_DELTA_DOWNLOAD_MS) return incomplete('time budget');
    const deltaFile = await downloadDelta(deltaDate, { timeoutMs: left });
    if (!deltaFile.found) return incomplete('delta not published');
    if (Date.now() >= deadline) return incomplete('time budget');

    const deltaLines = splitDeltaLines(await extractDeltaBuildingText(deltaFile.buffer));
    const deltaPlan = await planDeltaFile(prisma, deltaLines);
    const { tables } = await readJusoLinkDay(byDate.get(linkDate));
    const linkPlan = await planJusoLinkDay({ prisma, tables, search, deadlineAt: deadline });
    if (Date.now() >= deadline) return incomplete('time budget');

    const touched = [
      ...new Set(
        [...deltaPlan.ops, ...linkPlan.ops]
          .map((op) => (op.kind === 'upsert' ? op.link.buildingMgtNo : op.buildingMgtNo))
          .filter(Boolean),
      ),
    ];
    const existingRows = touched.length
      ? await prisma.$queryRaw`
          SELECT building_mgt_no AS "buildingMgtNo", road_sigungu_cd AS "roadSigunguCd", road_name_key AS "roadNameKey",
                 road_underground AS "roadUnderground", road_main_no AS "roadMainNo", road_sub_no AS "roadSubNo", kapt_code AS "kaptCode"
          FROM juso_building_links WHERE building_mgt_no = ANY(${touched}::varchar[])`
      : [];
    const compare = compareShadowPlans({
      deltaOps: deltaPlan.ops,
      linkOps: linkPlan.ops,
      existing: new Map(existingRows.map((row) => [row.buildingMgtNo, row])),
    });
    return record({
      incomplete: false,
      delta: deltaPlan.planned,
      deltaGate: evaluateDeltaGate(deltaPlan.gateInput),
      link: linkPlan.planned,
      linkGate: linkPlan.gate,
      compare,
    });
  } catch (error) {
    return incomplete(toReason(error));
  }
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
  download: (date, options) => downloadJusoDelta(date, options),
  downloadLinkDays: downloadLinkDaysWithKey,
  applyLinkDay: applyJusoLinkDay,
  readLinkDay: readJusoLinkDay,
  search: null,
  applyFile: applyJusoDeltaFile,
  fillBasis: fillKaptBasis,
  refill: refillComplexKaptCodes,
  cleanupSearchResults: (prisma) =>
    prisma.$executeRaw`
      DELETE FROM address_search_results WHERE fetched_at < now() - make_interval(hours => ${SEARCH_RESULT_RETENTION_HOURS}::int)`,
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
// 모드(JUSO_LINK_MODE)는 cron과 같다: apply면 공식 연계, off·shadow면 건물DB 일변동분(표에 쓰는 경로만 — shadow 비교는 cron에서만).
// 커서 다음 날짜부터 어제(KST)까지 밀린 날을 적용하고, 바뀐 도로명 키의 단지 kaptCode를 다시 채운다.
// 같은 표 잠금·날짜별 성공 기록을 그대로 쓰므로 cron과 겹쳐도 같은 날을 두 번 적용하지 않는다(겹치면 'already running').
// jobs에 JUSO_REFRESH_MANUAL(요청한 관리자 id)로 남긴다.
export const runJusoRefreshNow = async ({ prisma, requestedBy = null, now = () => new Date(), deps = {} }) => {
  const { download, downloadLinkDays, readLinkDay, applyLinkDay, applyFile, refill } = { ...defaultDeps, ...deps };
  const mode = deps.mode ?? getJusoLinkMode();
  const busy = await prisma.job.findFirst({
    where: { type: JUSO_REFRESH_JOB_TYPE, status: 'PROCESSING', lockedAt: { gt: new Date(Date.now() - JUSO_REFRESH_BUSY_MS) } },
    select: { id: true },
  });
  if (busy) throw new JusoRefreshBusyError();

  const base = Date.now();
  const today = formatDateKST(now());
  const keySet = createKeySet();
  const job = await prisma.job.create({
    data: { type: JUSO_REFRESH_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: new Date(), requestedByUserId: requestedBy, payload: { mode } },
    select: { id: true },
  });
  let status = 'FAILED';
  const result = { mode, today, juso: null, complexKaptCodesChanged: 0 };
  try {
    try {
      result.juso =
        mode === 'apply'
          ? await runLinkPhase({ prisma, base, today, keySet, downloadLinkDays, readLinkDay, applyLinkDay })
          : await runDeltaPhase({ prisma, base, today, keySet, download, applyFile });
    } catch (error) {
      console.error('[juso-refresh] 갱신 실패', toReason(error));
      result.juso = { error: toReason(error) };
    }
    if (keySet.size > 0) result.complexKaptCodesChanged = await refill(prisma, keySet.values());
    result.totalMs = Date.now() - base;
    status = result.juso?.error ? 'FAILED' : 'SUCCEEDED';
    return { jobId: job.id, ...result };
  } finally {
    await prisma.job.update({ where: { id: job.id }, data: { status, result, lockedAt: null } });
  }
};

// 실패는 단계마다 잡아서 결과에 남긴다(한 단계가 실패해도 다음 단계는 돈다). jobs에 REFERENCE_DATA_DAILY로 남긴다.
export const runReferenceDataCron = async ({ prisma, t0, bootAt, coldStart, now = () => new Date(), deps = {} }) => {
  const { download, downloadLinkDays, readLinkDay, applyLinkDay, search, applyFile, fillBasis, refill, cleanupSearchResults } = {
    ...defaultDeps,
    ...deps,
  };
  const mode = deps.mode ?? getJusoLinkMode();
  const base = resolveBudgetBase({ t0, bootAt, coldStart });
  const elapsedAtStart = Date.now() - base;
  const today = formatDateKST(now());
  const keySet = createKeySet();
  const result = { elapsedAtStart, today, mode, shadow: null, delta: null, basis: null, finalize: null };

  const job = await prisma.job.create({
    data: { type: REFERENCE_DATA_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: new Date(), payload: { elapsedAtStart } },
    select: { id: true },
  });
  let status = 'FAILED';
  try {
    if (mode === 'shadow') {
      try {
        const startedAt = Date.now();
        result.shadow = { ...(await runShadowPhase({ prisma, base, today, downloadLinkDays, downloadDelta: download, search })), ms: Date.now() - startedAt };
      } catch (error) {
        console.error('[reference-data] 공식 연계 비교 실패', toReason(error));
        result.shadow = { error: toReason(error) };
      }
    }

    try {
      const startedAt = Date.now();
      const phase =
        mode === 'apply'
          ? await runLinkPhase({ prisma, base, today, keySet, downloadLinkDays, readLinkDay, applyLinkDay })
          : await runDeltaPhase({ prisma, base, today, keySet, download, applyFile });
      result.delta = { ...phase, ms: Date.now() - startedAt };
    } catch (error) {
      console.error('[reference-data] 변동분 단계 실패', toReason(error));
      result.delta = { error: toReason(error) };
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
    const failed = [result.delta, result.basis, result.finalize].some((phase) => phase?.error);
    status = failed ? 'FAILED' : 'SUCCEEDED';
    return result;
  } finally {
    await prisma.job.update({ where: { id: job.id }, data: { status, result, lockedAt: null } });
  }
};
