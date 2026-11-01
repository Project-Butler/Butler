// juso 변동 하루치를 juso_building_links에 적용하는 엔진. 공식 연계(JUSO_LINK, jusoLinkApply.js)가 쓴다.
// 순서: 파일 크기·SHA-1 → 실행 잠금(RUNNING 행) → 줄 전체를 계획·게이트(쓰기 전) → 2,000줄 묶음마다 한 트랜잭션
// (xact lock + 집합 upsert/delete + 단지 주소 칸 + cursor_line). 마감이 지나면 PARTIAL(+ cursor_line)로 멈추고,
// 다음 실행이 같은 파일(크기·SHA-1 같음)이면 cursor_line부터, 다르면 0줄부터 다시 한다(건물관리번호 기준이라 결과가 같다).
import { collapseDeltaOps } from './jusoDeltaApplier.js';
import { BATCH_SIZE, updateComplexAddresses, writeLinkBatch } from './jusoLinks.js';
import {
  addDays,
  finishImport,
  findDeltaCursorDate,
  ImportAlreadyRunningError,
  LOCK_KEYS,
  releaseStaleRunning,
  resumeImport,
  startImport,
  takeXactLock,
  toDateValue,
} from './referenceImports.js';

export const BATCH_TRANSACTION_TIMEOUT_MS = 15_000;

// 지울 연산 대상 중 지금 표에 있는 행 수와 표 전체 행 수(삭제 상한 게이트용)
export const countDeleteTargets = async (prisma, deletes) => {
  const [{ existing }] = deletes.length
    ? await prisma.$queryRaw`SELECT count(*)::int AS existing FROM juso_building_links WHERE building_mgt_no = ANY(${deletes}::varchar[])`
    : [{ existing: 0 }];
  const [{ total }] = await prisma.$queryRaw`SELECT count(*)::int AS total FROM juso_building_links`;
  return { existing, total };
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
