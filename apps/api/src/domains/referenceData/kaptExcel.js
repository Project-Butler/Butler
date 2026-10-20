// K-apt 기본정보 엑셀(공동주택 단지 기본정보, k-apt.go.kr 내려받기) → kapt_complexes 기본정보 칸 + kapt_address_links(KAPT_EXCEL).
// 처음 적재·분기 재적재 전용(A팀 로컬). 1행은 안내문, 2행이 머리글. 같은 단지코드가 도로명주소만 달리 여러 줄 나온다.
// 쓰기는 한 트랜잭션: 기본정보 칸 UPDATE + 연결 upsert(import_run_id = 이번 실행) → 게이트 → 이번 실행이 아닌 KAPT_EXCEL 행 sweep.
import { parseJibunLots, parseRoadAddress } from '../complexes/kaptAddress.js';
import { refillComplexKaptCodes } from './complexKaptCodes.js';
import {
  findLastSucceeded,
  finishImport,
  ImportGateError,
  LOCK_KEYS,
  releaseStaleRunning,
  SOURCES,
  startImport,
  takeXactLock,
  toDateValue,
} from './referenceImports.js';

export const EXCEL_GATE = {
  minRowsRead: 20_000,
  minParsedRate: 0.95,
  maxRateDropFromLast: 0.05,
  minRowsReadRatioFromLast: 0.9,
};

const HEADERS = {
  kaptCode: '단지코드',
  name: '단지명',
  jibunAddress: '법정동주소',
  roadAddress: '도로명주소',
  saleType: '분양형태',
  approvalDate: '사용승인일',
  buildingCount: '동수',
  householdCount: '세대수',
};

const WRITE_BATCH_SIZE = 1000;

const cellText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return cellText(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value instanceof Date) return value.toISOString().slice(0, 10).replaceAll('-', '');
  }
  return String(value).trim();
};

const toCount = (value) => {
  const number = Number(cellText(value).replaceAll(',', ''));
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};

// '19900903' → '1990-09-03'(날짜가 아니면 null)
export const toApprovalDate = (value) => {
  const text = cellText(value).replace(/\D/g, '');
  if (!/^\d{8}$/.test(text)) return null;
  const ymd = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ymd ? null : ymd;
};

// 머리글 행(배열) → { 칸 이름: 열 번호 }. 필요한 머리글이 없으면 ImportGateError('형식 변경').
export const toHeaderIndex = (headerValues) => {
  const index = {};
  headerValues.forEach((value, column) => {
    const text = cellText(value);
    for (const [key, header] of Object.entries(HEADERS)) if (text === header) index[key] = column;
  });
  const missing = Object.keys(HEADERS).filter((key) => index[key] === undefined);
  if (missing.length > 0) throw new ImportGateError(`format changed: missing headers ${missing.map((key) => HEADERS[key]).join(',')}`);
  return index;
};

// 엑셀 줄들(머리글 다음부터) → 단지코드별 묶음. 첫 줄의 값을 쓰고, 도로명주소는 줄마다 모은다.
export const groupExcelRows = (rows, headerIndex) => {
  const groups = new Map();
  for (const values of rows) {
    const kaptCode = cellText(values[headerIndex.kaptCode]);
    if (!kaptCode) continue;
    let group = groups.get(kaptCode);
    if (!group) {
      group = {
        kaptCode,
        name: cellText(values[headerIndex.name]) || null,
        jibunAddress: cellText(values[headerIndex.jibunAddress]) || null,
        roadAddresses: [],
        saleType: cellText(values[headerIndex.saleType]) || null,
        approvalDate: toApprovalDate(values[headerIndex.approvalDate]),
        buildingCount: toCount(values[headerIndex.buildingCount]),
        householdCount: toCount(values[headerIndex.householdCount]),
      };
      groups.set(kaptCode, group);
    }
    const roadAddress = cellText(values[headerIndex.roadAddress]);
    if (roadAddress && !group.roadAddresses.includes(roadAddress)) group.roadAddresses.push(roadAddress);
  }
  return groups;
};

// 단지 묶음 + 목록의 법정동 코드 → { columns, links }. 도로명 키 파싱은 kaptAddress.parseRoadAddress(단일 출처).
export const toExcelWrite = (group, legalDongCode) => {
  // 필지가 여럿이면 첫 필지(산 제외). 전체 목록은 원문(jibun_address)에서 연결 때 다시 읽는다(kaptLookup).
  const [lot] = parseJibunLots(group.jibunAddress);
  const keys = new Map();
  for (const address of group.roadAddresses) {
    const key = parseRoadAddress(address, legalDongCode);
    if (!key || !key.sigunguCd) continue;
    keys.set(`${key.sigunguCd}|${key.roadNameKey}|${key.underground}|${key.mainNo}|${key.subNo}`, key);
  }
  return {
    columns: {
      kaptCode: group.kaptCode,
      roadAddress: group.roadAddresses[0] ?? null,
      jibunAddress: group.jibunAddress,
      mainLot: lot ? lot.mainLot : null,
      subLot: lot ? lot.subLot : null,
      saleType: group.saleType,
      householdCount: group.householdCount,
      buildingCount: group.buildingCount,
      approvalDate: group.approvalDate,
    },
    links: [...keys.values()].map((key) => ({ ...key, kaptCode: group.kaptCode })),
  };
};

// 결과: { ok: true } | { ok: false, reason }
export const evaluateExcelGate = ({ rowsRead, parsedRate }, last = null, gate = EXCEL_GATE) => {
  if (rowsRead < gate.minRowsRead) return { ok: false, reason: `rows read ${rowsRead} < ${gate.minRowsRead}` };
  if (parsedRate < gate.minParsedRate) return { ok: false, reason: `parsed rate ${(parsedRate * 100).toFixed(1)}% < 95%` };
  if (last) {
    if (typeof last.parsedRate === 'number' && parsedRate < last.parsedRate - gate.maxRateDropFromLast) {
      return { ok: false, reason: 'parsed rate dropped more than 5%p from last success' };
    }
    if (typeof last.rowsRead === 'number' && rowsRead < last.rowsRead * gate.minRowsReadRatioFromLast) {
      return { ok: false, reason: 'rows read below 90% of last success' };
    }
  }
  return { ok: true };
};

// exceljs 스트리밍(devDependency라 이 함수 안에서만 불러온다 — 서버 번들에 넣지 않음)
const readWorkbookRows = async (filePath) => {
  const { default: ExcelJS } = await import('exceljs');
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    hyperlinks: 'ignore',
    styles: 'ignore',
  });
  const rows = [];
  for await (const worksheet of reader) {
    for await (const row of worksheet) rows.push(row.values);
    break; // 첫 시트만
  }
  return rows;
};

const toChunks = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const writeBasisColumns = (tx, columns, fileDate, now) =>
  tx.$executeRaw`
    UPDATE kapt_complexes k SET road_address = u.ra, jibun_address = u.ja, main_lot = u.ml, sub_lot = u.sl,
      sale_type = u.st, household_count = u.hc, building_count = u.bc, approval_date = u.ad,
      basis_source = 'EXCEL', basis_file_date = ${fileDate}::date, basis_fetched_at = ${now}, basis_error = NULL,
      updated_at = ${now}
    FROM unnest(
      ${columns.map((column) => column.kaptCode)}::varchar[],
      ${columns.map((column) => column.roadAddress)}::text[],
      ${columns.map((column) => column.jibunAddress)}::text[],
      ${columns.map((column) => column.mainLot)}::int[],
      ${columns.map((column) => column.subLot)}::int[],
      ${columns.map((column) => column.saleType)}::varchar[],
      ${columns.map((column) => column.householdCount)}::int[],
      ${columns.map((column) => column.buildingCount)}::int[],
      ${columns.map((column) => column.approvalDate)}::date[]
    ) AS u(code, ra, ja, ml, sl, st, hc, bc, ad)
    WHERE k.kapt_code = u.code`;

const writeLinks = (tx, links, runId) =>
  tx.$executeRaw`
    INSERT INTO kapt_address_links (source, road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no,
      kapt_code, import_run_id, updated_at)
    SELECT 'KAPT_EXCEL', u.sgg, u.rnk, u.ug, u.mn, u.sn, u.kc, ${runId}::uuid, now()
    FROM unnest(
      ${links.map((link) => link.sigunguCd)}::varchar[],
      ${links.map((link) => link.roadNameKey)}::text[],
      ${links.map((link) => link.underground)}::boolean[],
      ${links.map((link) => link.mainNo)}::int[],
      ${links.map((link) => link.subNo)}::int[],
      ${links.map((link) => link.kaptCode)}::varchar[]
    ) AS u(sgg, rnk, ug, mn, sn, kc)
    ON CONFLICT (source, road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, kapt_code)
    DO UPDATE SET import_run_id = EXCLUDED.import_run_id, updated_at = now()`;

// fileDate: 엑셀 추출일 'YYYY-MM-DD'
export const runKaptExcelImport = async ({ prisma, filePath, fileDate, readRows = readWorkbookRows, log = () => {} }) => {
  const startedAt = Date.now();
  await releaseStaleRunning(prisma, LOCK_KEYS.KAPT_EXCEL);
  const run = await startImport(prisma, {
    source: SOURCES.KAPT_EXCEL,
    lockKey: LOCK_KEYS.KAPT_EXCEL,
    fileName: filePath.split(/[\\/]/).pop(),
    fileDate: toDateValue(fileDate),
  });

  try {
    const rows = await readRows(filePath);
    // 1행 안내문, 2행 머리글
    const headerRowIndex = rows.findIndex((values) => (values ?? []).some((value) => cellText(value) === HEADERS.kaptCode));
    if (headerRowIndex < 0) throw new ImportGateError('format changed: header row not found');
    const headerIndex = toHeaderIndex(rows[headerRowIndex]);
    const dataRows = rows.slice(headerRowIndex + 1).filter((values) => cellText(values?.[headerIndex.kaptCode]));
    const groups = groupExcelRows(dataRows, headerIndex);

    const listed = await prisma.kaptComplex.findMany({ select: { kaptCode: true, legalDongCode: true } });
    const legalDongByCode = new Map(listed.map((row) => [row.kaptCode, row.legalDongCode]));

    const columns = [];
    const links = [];
    let notInList = 0;
    let parsedCodes = 0;
    for (const group of groups.values()) {
      const legalDongCode = legalDongByCode.get(group.kaptCode);
      if (!legalDongCode) {
        notInList += 1;
        continue;
      }
      const write = toExcelWrite(group, legalDongCode);
      columns.push(write.columns);
      links.push(...write.links);
      if (write.links.length > 0) parsedCodes += 1;
    }
    const stats = {
      fileDate,
      rowsRead: dataRows.length,
      uniqueCodes: groups.size,
      notInList,
      basisWritten: columns.length,
      parsedCodes,
      parsedRate: parsedCodes / (groups.size || 1),
      links: links.length,
      withSaleType: columns.filter((column) => column.saleType).length,
      multiAddressCodes: [...groups.values()].filter((group) => group.roadAddresses.length > 1).length,
    };
    log(`엑셀 ${stats.rowsRead}줄, 단지 ${stats.uniqueCodes}, 목록에 없음 ${notInList}, 도로명 키 ${parsedCodes}(${(stats.parsedRate * 100).toFixed(2)}%)`);

    const last = await findLastSucceeded(prisma, SOURCES.KAPT_EXCEL);
    const gate = evaluateExcelGate(stats, last?.stats ?? null);
    if (!gate.ok) throw new ImportGateError(gate.reason, stats);

    const now = new Date();
    const swept = await prisma.$transaction(
      async (tx) => {
        await takeXactLock(tx, LOCK_KEYS.KAPT_EXCEL);
        for (const chunk of toChunks(columns, WRITE_BATCH_SIZE)) await writeBasisColumns(tx, chunk, fileDate, now);
        for (const chunk of toChunks(links, WRITE_BATCH_SIZE)) await writeLinks(tx, chunk, run.id);
        return tx.$executeRaw`
          DELETE FROM kapt_address_links WHERE source = 'KAPT_EXCEL' AND import_run_id IS DISTINCT FROM ${run.id}::uuid`;
      },
      { timeout: 600_000, maxWait: 10_000 },
    );
    stats.swept = swept;
    stats.complexKaptCodesChanged = await refillComplexKaptCodes(prisma, null);
    stats.totalMs = Date.now() - startedAt;
    await finishImport(prisma, run.id, { status: 'SUCCEEDED', rowsRead: stats.rowsRead, rowsWritten: links.length, stats });
    return { runId: run.id, ...stats };
  } catch (error) {
    await finishImport(prisma, run.id, {
      status: 'FAILED',
      error: error.reason ?? error.code ?? 'internal error',
      rowsRead: error.stats?.rowsRead ?? 0,
      stats: error.stats ?? undefined,
    });
    throw error;
  }
};
