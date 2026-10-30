// juso 변동 하루치를 juso_building_links에 적용한다. 건물DB 일변동분(JUSO_DELTA: CLI apply:juso-changes·매일 cron)과
// 공식 연계(JUSO_LINK, jusoLinkApply.js)가 같은 적용 엔진(applyCursorImport)을 쓴다.
// 순서: 파일 크기·SHA-1 → 실행 잠금(RUNNING 행) → 줄 전체를 계획·게이트(쓰기 전) → 2,000줄 묶음마다 한 트랜잭션
// (xact lock + 집합 upsert/delete + 단지 주소 칸 + cursor_line). 마감이 지나면 PARTIAL(+ cursor_line)로 멈추고,
// 다음 실행이 같은 파일(크기·SHA-1 같음)이면 cursor_line부터, 다르면 0줄부터 다시 한다(건물관리번호 기준이라 결과가 같다).
import { createHash } from 'node:crypto';
import {
  collapseDeltaOps,
  evaluateDeltaGate,
  planDeltaLine,
  splitDeltaLines,
} from './jusoDeltaApplier.js';
import { parseBuildingLine } from './jusoBuildingMatcher.js';
import { decodeCp949, readZipBuffer } from './jusoFiles.js';
import { BATCH_SIZE, updateComplexAddresses, writeLinkBatch } from './jusoLinks.js';
import { loadKaptLookup } from './kaptLookup.js';
import {
  addDays,
  finishImport,
  findDeltaCursorDate,
  ImportAlreadyRunningError,
  LOCK_KEYS,
  releaseStaleRunning,
  resumeImport,
  SOURCES,
  startImport,
  takeXactLock,
  toDateValue,
} from './referenceImports.js';

export { addDays };

export const BATCH_TRANSACTION_TIMEOUT_MS = 15_000;
export const DOWNLOAD_TIMEOUT_MS = 10_000;

const BUILDING_ENTRY_PATTERN = /TI_SPBD_BULD\.TXT$/i;

const compact = (ymd) => ymd.replaceAll('-', '');

// 사람 없이 받는 주소(로그인·세션 없음, 2026-10 스파이크). stdde = 변동 기준일.
export const toDeltaDownloadUrl = (ymd) => {
  const day = compact(ymd);
  const fileName = `${day}_dailynoticedata.zip`;
  const params = new URLSearchParams({
    regYmd: day.slice(0, 4),
    reqType: 'DC',
    stdde: day,
    fileName,
    realFileName: fileName,
    intFileNo: '0',
    intNum: '0',
  });
  return `https://business.juso.go.kr/api/jst/download?${params}`;
};

// 결과: { found: true, buffer, fileName } | { found: false }(아직 안 올라온 날짜 → HTTP 400)
// 그 밖의 HTTP 오류·네트워크 오류는 던진다.
export const downloadJusoDelta = async (ymd, { fetchImpl = fetch, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) => {
  const response = await fetchImpl(toDeltaDownloadUrl(ymd), { signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 400 || response.status === 404) return { found: false };
  if (!response.ok) throw Object.assign(new Error('juso delta download failed'), { reason: `HTTP ${response.status}` });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { found: true, buffer, fileName: `${compact(ymd)}_dailynoticedata.zip` };
};

// zip(일변동 파일 묶음) 또는 TI_SPBD_BULD 글자 파일 → 건물 변동 글자
export const extractDeltaBuildingText = async (buffer) => {
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const files = await readZipBuffer(buffer);
    const name = Object.keys(files).find((fileName) => BUILDING_ENTRY_PATTERN.test(fileName));
    if (!name) throw Object.assign(new Error('no building file'), { reason: 'format changed: no TI_SPBD_BULD in zip' });
    return decodeCp949(files[name]);
  }
  return decodeCp949(buffer);
};

const sha1 = (buffer) => createHash('sha1').update(buffer).digest('hex');

// 파일에 나온 시군구·법정동만 K-apt 조회를 읽는다.
const loadLookupForLines = async (prisma, lines) => {
  const sigunguCodes = new Set();
  const legalDongCodes = new Set();
  for (const line of lines) {
    const row = parseBuildingLine(line);
    if (!row) continue;
    sigunguCodes.add(row.legalDongCode.slice(0, 5));
    legalDongCodes.add(row.legalDongCode);
    legalDongCodes.add(row.buildingMgtNo.slice(0, 10));
  }
  return loadKaptLookup(prisma, { sigunguCodes: [...sigunguCodes], legalDongCodes: [...legalDongCodes] });
};

// 지울 연산 대상 중 지금 표에 있는 행 수와 표 전체 행 수(삭제 상한 게이트용)
export const countDeleteTargets = async (prisma, deletes) => {
  const [{ existing }] = deletes.length
    ? await prisma.$queryRaw`SELECT count(*)::int AS existing FROM juso_building_links WHERE building_mgt_no = ANY(${deletes}::varchar[])`
    : [{ existing: 0 }];
  const [{ total }] = await prisma.$queryRaw`SELECT count(*)::int AS total FROM juso_building_links`;
  return { existing, total };
};

// 건물DB 일변동분 줄 전체 계획 + 게이트 수치(쓰기 없음). shadow 비교도 이 결과를 쓴다.
export const planDeltaFile = async (prisma, lines) => {
  const lookup = await loadLookupForLines(prisma, lines);
  const ops = lines.map((line) => planDeltaLine(line, lookup));
  const unknownCodes = [...new Set(ops.filter((op) => op.kind === 'unknown').map((op) => op.code))].sort();
  const invalidCount = ops.filter((op) => op.kind === 'invalid').length;
  const { deletes, upserts } = collapseDeltaOps(ops);
  const { existing, total } = await countDeleteTargets(prisma, deletes);
  const codes = {};
  for (const op of ops) {
    const code = op.row?.changeReasonCode ?? op.code ?? 'invalid';
    codes[code] = (codes[code] ?? 0) + 1;
  }
  return {
    ops,
    gateInput: { lineCount: lines.length, invalidCount, unknownCodes, existingDeleteCount: existing, totalLinks: total },
    planned: { upserts: upserts.length, deletes: deletes.length, existingDeletes: existing, codes },
  };
};

// 하루치 적용 엔진(출처 공통). source의 커서·PARTIAL·성공 기록으로 순서를 지킨다.
// fileSize·fileSha1: 이어 하기 식별(같으면 cursor_line부터). prepare(): 쓰기 전 계획
//   → { ops(줄 순서 연산 배열), rowsRead, planned(통계), gate: { ok, reason } } (형식 문제는 reason 붙여 던진다)
// beforeBatches(tx): 묶음 전에 한 번 도는 쓰기(공식 연계의 도로명 변경). 같은 값이면 바뀌지 않아 이어 하기에서 다시 돌아도 된다.
// deadlineAt이 지나면 새 묶음을 시작하지 않는다. allowGap: 커서 다음 날짜가 아니어도 적용(CLI 전용, 손으로 확인했을 때만).
// keySet: 바뀐 도로명 키를 모은다. clock: 마감 비교용 현재 시각(ms, 테스트에서 바꿈).
// 결과 status: SUCCEEDED | PARTIAL | FAILED | SKIPPED
export const applyCursorImport = async ({
  prisma,
  source,
  fileDate,
  fileName = null,
  fileSize,
  fileSha1,
  prepare,
  beforeBatches = null,
  deadlineAt = Infinity,
  batchSize = BATCH_SIZE,
  allowGap = false,
  keySet = null,
  noBaselineReason = 'no baseline (run import:juso-buildings first)',
  now = () => new Date(),
  clock = Date.now,
}) => {
  await releaseStaleRunning(prisma, LOCK_KEYS.JUSO, now());
  const fileDateValue = toDateValue(fileDate);
  const succeeded = await prisma.dataImport.findFirst({
    where: { source, status: 'SUCCEEDED', fileDate: fileDateValue },
    select: { id: true },
  });
  if (succeeded) return { status: 'SKIPPED', reason: 'already applied', fileDate };

  const partials = await prisma.dataImport.findMany({
    where: { source, status: 'PARTIAL' },
    orderBy: { startedAt: 'desc' },
  });
  const partial = partials.find((row) => row.fileDate?.toISOString().slice(0, 10) === fileDate) ?? null;
  if (!partial && partials.length > 0) {
    return { status: 'SKIPPED', reason: `PARTIAL ${partials[0].fileDate?.toISOString().slice(0, 10)} must finish first`, fileDate };
  }

  if (!partial) {
    const cursorDate = await findDeltaCursorDate(prisma, source);
    if (!cursorDate && !allowGap) return { status: 'SKIPPED', reason: noBaselineReason, fileDate };
    if (cursorDate && fileDate <= cursorDate) return { status: 'SKIPPED', reason: `older than cursor ${cursorDate}`, fileDate };
    if (cursorDate && fileDate !== addDays(cursorDate, 1) && !allowGap) {
      return { status: 'SKIPPED', reason: `gap: expected ${addDays(cursorDate, 1)}`, fileDate };
    }
  }

  const sameFile = partial && partial.fileSize === fileSize && partial.fileSha1 === fileSha1;
  let run;
  try {
    run = partial
      ? await resumeImport(prisma, partial.id, { fileSize, fileSha1, fileName, ...(sameFile ? {} : { cursorLine: 0 }) })
      : await startImport(prisma, {
          source,
          lockKey: LOCK_KEYS.JUSO,
          fileName,
          fileDate: fileDateValue,
          fileSize,
          fileSha1,
        });
  } catch (error) {
    // 전체분이나 다른 변동분이 같은 표에 쓰는 중이면 실패가 아니라 건너뜀으로 남긴다.
    if (error instanceof ImportAlreadyRunningError) return { status: 'SKIPPED', reason: 'already running', fileDate };
    throw error;
  }
  const startCursor = sameFile ? partial.cursorLine : 0;
  const stats = { fileDate, restartedFromZero: Boolean(partial && !sameFile), startCursor, batches: 0, maxBatchMs: 0 };

  let plan;
  try {
    plan = await prepare();
  } catch (error) {
    const reason = error.reason ?? error.code ?? 'internal error';
    await finishImport(prisma, run.id, { status: 'FAILED', error: reason, stats });
    return { status: 'FAILED', reason, fileDate };
  }
  const { ops, rowsRead } = plan;
  Object.assign(stats, { lines: rowsRead, ...plan.planned });

  if (!plan.gate.ok) {
    await finishImport(prisma, run.id, { status: 'FAILED', error: plan.gate.reason, rowsRead, stats });
    return { status: 'FAILED', reason: plan.gate.reason, fileDate, stats };
  }

  let cursor = startCursor;
  let rowsWritten = run.rowsWritten ?? 0;
  try {
    if (beforeBatches) {
      const before = await prisma.$transaction(
        async (tx) => {
          await takeXactLock(tx, LOCK_KEYS.JUSO);
          return beforeBatches(tx);
        },
        { timeout: BATCH_TRANSACTION_TIMEOUT_MS, maxWait: 5_000 },
      );
      Object.assign(stats, before ?? {});
    }
    while (cursor < ops.length) {
      if (clock() >= deadlineAt) {
        await finishImport(prisma, run.id, { status: 'PARTIAL', rowsRead, stats });
        return { status: 'PARTIAL', fileDate, cursorLine: cursor, stats };
      }
      const end = Math.min(cursor + batchSize, ops.length);
      const batch = collapseDeltaOps(ops.slice(cursor, end));
      const batchStartedAt = Date.now();
      const written = await prisma.$transaction(
        async (tx) => {
          await takeXactLock(tx, LOCK_KEYS.JUSO);
          const result = await writeLinkBatch(tx, { ...batch, runId: run.id, fileDate, keySet });
          const complexes = await updateComplexAddresses(tx, batch.addressRows, keySet);
          const changed = result.upserted + result.deleted;
          await tx.dataImport.update({
            where: { id: run.id },
            data: { cursorLine: end, rowsWritten: { increment: changed } },
          });
          return { ...result, complexes, changed };
        },
        { timeout: BATCH_TRANSACTION_TIMEOUT_MS, maxWait: 5_000 },
      );
      const batchMs = Date.now() - batchStartedAt;
      stats.batches += 1;
      stats.maxBatchMs = Math.max(stats.maxBatchMs, batchMs);
      stats.upserted = (stats.upserted ?? 0) + written.upserted;
      stats.deleted = (stats.deleted ?? 0) + written.deleted;
      stats.complexesUpdated = (stats.complexesUpdated ?? 0) + written.complexes;
      rowsWritten += written.changed;
      cursor = end;
    }
  } catch (error) {
    const reason = error.reason ?? error.code ?? 'internal error';
    await finishImport(prisma, run.id, { status: 'PARTIAL', error: reason, rowsRead, stats });
    return { status: 'PARTIAL', reason, fileDate, cursorLine: cursor, stats };
  }

  await finishImport(prisma, run.id, { status: 'SUCCEEDED', rowsRead, rowsWritten, stats });
  return { status: 'SUCCEEDED', fileDate, cursorLine: cursor, rowsWritten, stats };
};

// 건물DB 일변동분 파일 하나. fileDate 'YYYY-MM-DD'(변동 기준일 stdde). 나머지 인자는 applyCursorImport와 같다.
export const applyJusoDeltaFile = async ({ prisma, fileDate, fileName = null, buffer, ...options }) =>
  applyCursorImport({
    prisma,
    source: SOURCES.JUSO_DELTA,
    fileDate,
    fileName,
    fileSize: BigInt(buffer.length),
    fileSha1: sha1(buffer),
    prepare: async () => {
      const lines = splitDeltaLines(await extractDeltaBuildingText(buffer));
      const plan = await planDeltaFile(prisma, lines);
      return { ops: plan.ops, rowsRead: lines.length, planned: plan.planned, gate: evaluateDeltaGate(plan.gateInput) };
    },
    ...options,
  });
