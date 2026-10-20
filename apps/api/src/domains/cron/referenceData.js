// 매일 cron(/api/cron/reference-data) — 한 번에 60초 안. 구간(시간 예산 기준 시각부터):
//   0~30초  juso 건물DB 변동분 적용(20초가 지나면 새 파일을 받지 않음, 30초가 지나면 새 묶음을 시작하지 않고 PARTIAL)
//   30~45초 새 K-apt 단지 기본정보 채우기(KAPT_API 연결·분양형태)
//   45~50초 바뀐 도로명 키의 단지 kaptCode 다시 채우기 + 24시간 지난 검색 저장본 삭제
//   50초    강제 중단(새 일을 시작하지 않는다)
// 시간 예산 기준은 요청이 핸들러에 들어온 시각 t0다. vercel.json이 모든 경로를 함수 하나로 보내서 cron은 몇 시간 전에
// 데워진 인스턴스에서 돌 수 있다 — 모듈 로드 시각으로 재면 모든 마감이 지난 것으로 보여 아무것도 안 하고 끝난다.
// 콜드 스타트 직후 첫 호출에서만 min(t0, BOOT_AT)을 쓴다(콜드 스타트 시간도 60초에 들어가므로).
import { formatDateKST } from '../../platform/dateUtils.js';
import { KAPT_BASIS_CRON_LIMIT } from '../complexes/apiUsage.js';
import { fillKaptBasis } from '../complexes/kaptBasis.js';
import { addDays, applyJusoDeltaFile, downloadJusoDelta } from '../referenceData/jusoDelta.js';
import { refillComplexKaptCodes } from '../referenceData/complexKaptCodes.js';
import { createKeySet } from '../referenceData/jusoLinks.js';
import { findDeltaCursorDate, LOCK_KEYS, SOURCES, toDateValue } from '../referenceData/referenceImports.js';

export const REFERENCE_DATA_JOB_TYPE = 'REFERENCE_DATA_DAILY';

export const PHASES = {
  deltaDownloadCutoffMs: 20_000,
  deltaEndMs: 30_000,
  basisEndMs: 45_000,
  hardStopMs: 50_000,
};
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

const defaultDeps = {
  download: (date) => downloadJusoDelta(date),
  applyFile: applyJusoDeltaFile,
  fillBasis: fillKaptBasis,
  refill: refillComplexKaptCodes,
  cleanupSearchResults: (prisma) =>
    prisma.$executeRaw`
      DELETE FROM address_search_results WHERE fetched_at < now() - make_interval(hours => ${SEARCH_RESULT_RETENTION_HOURS}::int)`,
};

// 실패는 단계마다 잡아서 결과에 남긴다(한 단계가 실패해도 다음 단계는 돈다). jobs에 REFERENCE_DATA_DAILY로 남긴다.
export const runReferenceDataCron = async ({ prisma, t0, bootAt, coldStart, now = () => new Date(), deps = {} }) => {
  const { download, applyFile, fillBasis, refill, cleanupSearchResults } = { ...defaultDeps, ...deps };
  const base = resolveBudgetBase({ t0, bootAt, coldStart });
  const elapsedAtStart = Date.now() - base;
  const today = formatDateKST(now());
  const keySet = createKeySet();
  const result = { elapsedAtStart, today, delta: null, basis: null, finalize: null };

  const job = await prisma.job.create({
    data: { type: REFERENCE_DATA_JOB_TYPE, status: 'PROCESSING', attempts: 1, lockedAt: new Date(), payload: { elapsedAtStart } },
    select: { id: true },
  });
  let status = 'FAILED';
  try {
    try {
      const startedAt = Date.now();
      result.delta = { ...(await runDeltaPhase({ prisma, base, today, keySet, download, applyFile })), ms: Date.now() - startedAt };
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
