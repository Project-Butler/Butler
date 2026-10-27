// juso 건물DB 전체분 → juso_building_links 전체 적재(A팀 로컬, 처음 한 번·분기 재적재).
// 파일 읽기·맞추기는 트랜잭션 밖에서 끝내고(메모리), 게이트를 넘으면 한 트랜잭션에서 묶음 upsert + sweep.
// 실행 단위 잠금은 RUNNING 행(lock_key juso_building_links — 변동분과 같은 키), 쓰기 트랜잭션은 xact lock을 한 번 더.
import { inferFullFileDate, decodeLines, openFullSource } from './jusoFiles.js';
import { matchBuilding, parseBuildingLine } from './jusoBuildingMatcher.js';
import { refillComplexKaptCodes } from './complexKaptCodes.js';
import { BATCH_SIZE, writeLinkBatch } from './jusoLinks.js';
import { loadKaptLookup } from './kaptLookup.js';
import {
  findLastSucceeded,
  finishImport,
  ImportGateError,
  LOCK_KEYS,
  moveDeltaCursorToBaseline,
  releaseStaleRunning,
  SOURCES,
  startImport,
  takeXactLock,
  toDateValue,
} from './referenceImports.js';

// 게이트 기준(2026-09 전체분 + 2026-10-16 K-apt 엑셀 실측: 도로명 키 96.4 / 번지 2.0 / 공동주택 표시 없음 1.5%)
export const FULL_GATE = {
  minRowsRead: 1_000_000,
  minLinkRate: 0.95,
  ruleRatios: { ROAD_KEY: 0.964, LOT: 0.02, NON_APT_FLAG: 0.015 },
  ruleTolerance: 0.015,
  maxRateDropFromLast: 0.05,
  minRowsReadRatioFromLast: 0.9,
};

// 줄(async iterable) → { links: Map(building_mgt_no → 연결 행), rowsRead, invalid, ruleRows }
// 같은 건물관리번호가 두 번 나오면 뒤의 줄이 이긴다.
export const collectFullLinks = async (lines, lookup, onLine = () => {}) => {
  const links = new Map();
  const ruleRows = { ROAD_KEY: 0, LOT: 0, NON_APT_FLAG: 0 };
  let rowsRead = 0;
  let invalid = 0;
  for await (const line of lines) {
    if (line.length === 0) continue;
    rowsRead += 1;
    onLine(rowsRead);
    const row = parseBuildingLine(line);
    if (!row) {
      invalid += 1;
      continue;
    }
    const link = matchBuilding(row, lookup);
    if (link) links.set(link.buildingMgtNo, link);
    else links.delete(row.buildingMgtNo);
  }
  for (const link of links.values()) ruleRows[link.matchRule] += 1;
  return { links, rowsRead, invalid, ruleRows };
};

// 단지별 대표 규칙(ROAD_KEY > LOT > NON_APT_FLAG)과 연결률. excelCodes = 엑셀에서 도로명 키로 파싱돼 쓴 단지 코드.
// 이번 실행의 juso 행만으로 계산한다(다른 소스 행은 세지 않음).
export const summarizeFullLinks = (links, excelCodes) => {
  const best = new Map();
  const order = { ROAD_KEY: 0, LOT: 1, NON_APT_FLAG: 2 };
  for (const link of links.values()) {
    const current = best.get(link.kaptCode);
    if (current === undefined || order[link.matchRule] < order[current]) best.set(link.kaptCode, link.matchRule);
  }
  const ruleCodes = { ROAD_KEY: 0, LOT: 0, NON_APT_FLAG: 0 };
  let linkedExcelCodes = 0;
  for (const code of excelCodes) {
    const rule = best.get(code);
    if (!rule) continue;
    linkedExcelCodes += 1;
    ruleCodes[rule] += 1;
  }
  const denominator = excelCodes.size || 1;
  const ruleRatios = Object.fromEntries(Object.entries(ruleCodes).map(([rule, count]) => [rule, count / denominator]));
  return { linkedCodes: best.size, linkedExcelCodes, excelCodes: excelCodes.size, linkRate: linkedExcelCodes / denominator, ruleCodes, ruleRatios };
};

// 결과: { ok: true } | { ok: false, reason }
export const evaluateFullGate = ({ rowsRead, linkRate, ruleRatios }, last = null, gate = FULL_GATE) => {
  if (rowsRead < gate.minRowsRead) return { ok: false, reason: `rows read ${rowsRead} < ${gate.minRowsRead}` };
  if (linkRate < gate.minLinkRate) return { ok: false, reason: `link rate ${(linkRate * 100).toFixed(1)}% < 95%` };
  for (const [rule, expected] of Object.entries(gate.ruleRatios)) {
    const actual = ruleRatios[rule] ?? 0;
    if (Math.abs(actual - expected) > gate.ruleTolerance) {
      return { ok: false, reason: `${rule} ratio ${(actual * 100).toFixed(1)}% outside ${(expected * 100).toFixed(1)}±1.5%p` };
    }
  }
  if (last) {
    if (typeof last.linkRate === 'number' && linkRate < last.linkRate - gate.maxRateDropFromLast) {
      return { ok: false, reason: `link rate dropped more than 5%p from last success` };
    }
    if (typeof last.rowsRead === 'number' && rowsRead < last.rowsRead * gate.minRowsReadRatioFromLast) {
      return { ok: false, reason: `rows read below 90% of last success` };
    }
  }
  return { ok: true };
};

async function* allLines(source, onFile) {
  for (const file of source.buildFiles) {
    onFile(file);
    yield* decodeLines(await file.open());
  }
}

// 엑셀에서 도로명 키로 쓴 단지 코드(활성)
const loadExcelCodes = async (prisma) => {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT l.kapt_code AS "kaptCode" FROM kapt_address_links l
    JOIN kapt_complexes kc ON kc.kapt_code = l.kapt_code AND kc.is_active
    WHERE l.source = 'KAPT_EXCEL'`;
  return new Set(rows.map((row) => row.kaptCode));
};

const toChunks = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

export const runJusoFullLoad = async ({ prisma, sourcePath, fileDate = null, log = () => {} }) => {
  const startedAt = Date.now();
  const deltaInFlight = await prisma.dataImport.findFirst({
    where: { source: SOURCES.JUSO_DELTA, status: { in: ['RUNNING', 'PARTIAL'] } },
    select: { id: true, status: true, fileDate: true },
  });
  if (deltaInFlight) {
    throw new ImportGateError(
      `juso delta ${deltaInFlight.status} (${deltaInFlight.fileDate?.toISOString().slice(0, 10)}) — finish it or mark it FAILED first`,
    );
  }

  const source = await openFullSource(sourcePath);
  const baselineDate = fileDate ?? inferFullFileDate(source.notice, sourcePath);
  if (!baselineDate) {
    source.close();
    throw new ImportGateError('file date unknown — pass --file-date YYYY-MM-DD');
  }

  await releaseStaleRunning(prisma, LOCK_KEYS.JUSO);
  const run = await startImport(prisma, {
    source: SOURCES.JUSO_FULL,
    lockKey: LOCK_KEYS.JUSO,
    fileName: sourcePath.split(/[\\/]/).pop(),
    fileDate: toDateValue(baselineDate),
    fileSize: BigInt(source.buildFiles.reduce((sum, file) => sum + file.size, 0)),
  });

  try {
    const lookup = await loadKaptLookup(prisma);
    log(`K-apt 조회: 도로명 키 ${lookup.size.roadKeys}, 번지 키 ${lookup.size.lotKeys}`);
    const collected = await collectFullLinks(
      allLines(source, (file) => log(`읽는 중 ${file.name} (${(file.size / 1e6).toFixed(0)}MB)`)),
      lookup,
    );
    source.close();
    const summary = summarizeFullLinks(collected.links, await loadExcelCodes(prisma));
    const stats = {
      fileDate: baselineDate,
      rowsRead: collected.rowsRead,
      invalid: collected.invalid,
      linkRows: collected.links.size,
      ruleRows: collected.ruleRows,
      ...summary,
      readMs: Date.now() - startedAt,
    };
    log(`읽기 끝: ${collected.rowsRead}줄, 연결 ${collected.links.size}행, 연결률 ${(summary.linkRate * 100).toFixed(2)}%`);

    const last = await findLastSucceeded(prisma, SOURCES.JUSO_FULL);
    const gate = evaluateFullGate(stats, last?.stats ?? null);
    if (!gate.ok) throw new ImportGateError(gate.reason, stats);

    const links = [...collected.links.values()];
    const writeStartedAt = Date.now();
    const written = await prisma.$transaction(
      async (tx) => {
        await takeXactLock(tx, LOCK_KEYS.JUSO);
        let upserted = 0;
        for (const chunk of toChunks(links, BATCH_SIZE)) {
          const result = await writeLinkBatch(tx, {
            upserts: chunk,
            deletes: [],
            runId: run.id,
            fileDate: baselineDate,
            markRun: true,
          });
          upserted += result.upserted;
        }
        const swept = await tx.$executeRaw`
          DELETE FROM juso_building_links WHERE import_run_id IS DISTINCT FROM ${run.id}::uuid`;
        return { upserted, swept };
      },
      { timeout: 600_000, maxWait: 10_000 },
    );
    stats.upserted = written.upserted;
    stats.swept = written.swept;
    stats.writeMs = Date.now() - writeStartedAt;

    stats.complexKaptCodesChanged = await refillComplexKaptCodes(prisma, null);
    stats.deltaCursor = await moveDeltaCursorToBaseline(prisma, baselineDate, { fullRunId: run.id });
    stats.totalMs = Date.now() - startedAt;
    await finishImport(prisma, run.id, {
      status: 'SUCCEEDED',
      rowsRead: collected.rowsRead,
      rowsWritten: written.upserted,
      stats,
    });
    return { runId: run.id, ...stats };
  } catch (error) {
    source.close();
    await finishImport(prisma, run.id, {
      status: 'FAILED',
      error: error.reason ?? error.code ?? 'internal error',
      rowsRead: error.stats?.rowsRead ?? 0,
      stats: error.stats ?? undefined,
    });
    throw error;
  }
};
