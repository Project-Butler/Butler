// 공식 연계 자료(100004 상세주소 동 표시 + 100001 도로명주소 한글 + regions) → matchBuilding 입력 행과 연산.
// 순수 함수만 둔다(DB·외부 호출 없음). 건물DB 31칸 줄(parseBuildingLine)이 없으므로 같은 모양의 행을 칸마다 출처를 정해 조립한다.
//
// 원칙: 모르면 쓰지 않는다. 기존 엔진(planDeltaLine)은 "맞는 단지 없음 = 삭제"지만, 공식 연계 행은 칸이 빠질 수 있어서
// 판단이 안 되는 경우를 unresolved(쓰지 않음, 기존 연결 유지)로 둔다. 폐지(63)는 건물관리번호로 지운다.
//
// 칸 출처(우선순위):
//   도로명 원문  ① 같은 날 100001(도로명관리번호 조인) ② juso 검색(건물관리번호 일치) — 없으면
//   도로명 키만  ③ 같은 도로명코드의 기존 연결(원문이 없어 단지 주소 칸은 고치지 않음)
//   공동주택 여부 ① 같은 날 100001 ② 기존 연결이 LOT(공동주택일 때만 생기는 규칙) ③ juso 검색 bdKdcd ④ 모름 → 불변 규칙
//   대표 지번    ① 같은 날 100001 ② 없음(건물관리번호 앞 19자리 PNU만으로 필지 맞추기)
//   시도·시군구·읍면동 이름  ① 같은 날 100001 ② regions(법정동 코드를 읍면동으로 올려 조인) ③ 없음 → 단지 주소 칸 고치지 않음
// 불변 규칙: 공동주택 여부를 모르면 0과 1 두 값으로 맞춰 보고, 단지 코드(또는 없음)가 같으면 그 결과로 정한다.
//   이때 규칙 이름은 0 쪽(NON_APT_FLAG)으로 남긴다 — 나중에 이 연결을 "공동주택"의 근거로 쓰지 않게.
import { matchBuilding, roadKeyId, toBuildingLotKeyIds, toBuildingRoadKey } from './jusoBuildingMatcher.js';
import { MAX_DELETE_RATIO, MAX_PARSE_FAILURE_RATIO } from './jusoDeltaApplier.js';
import { rollUpLegalDongCode } from '../domains/complexes/provider/pnu.js';

// 표마다 칸 수(가이드 "컬럼 상세", 2026-10 실제 파일로 확인)
export const LINK_COLUMN_COUNTS = {
  TH_RNSPBD_DONG: 11,
  TH_SGCO_RNADR_MST: 24,
  TH_SGCO_RNADR_LNBR: 14,
  TI_SPRD_RDNM: 21,
};

// 상세주소 동 표시의 이동사유코드: 31 신규, 34 변동, 63 폐지
export const LINK_CHANGE_REASONS = { 31: 'ADD', 34: 'CHANGE', 63: 'DELETE' };

// unresolved가 이 비율을 넘고(분모: 판단 대상 건물) 이 개수 이상이면 그날 적용을 멈춘다.
export const MAX_UNRESOLVED_RATIO = 0.01;
export const MIN_UNRESOLVED_TO_FAIL = 5;

const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;
const BUILDING_MGT_NO_PATTERN = /^\d{25}$/;
const ROAD_CODE_PATTERN = /^\d{12}$/;
const NUMBER_PATTERN = /^\d{1,5}$/;

const toInt = (value) => (NUMBER_PATTERN.test(value ?? '') ? Number(value) : null);
const trimOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};
const toUnderground = (value) => {
  if (value === '0') return false;
  if (value === '1') return true;
  return null;
};

// 100004 상세주소 동 표시 한 줄(11칸) → 행. 칸 수·키 형식이 틀리면 null.
// 법정동코드|건축물대장건물명|상세건물명|시군구용건물명|도로명코드|지하여부|건물본번|건물부번|도로명관리번호|건물관리번호|이동사유코드
export const parseDongLine = (line) => {
  const fields = line.split('|');
  if (fields.length !== LINK_COLUMN_COUNTS.TH_RNSPBD_DONG) return null;
  const [legalDongCode, , detailBuildingName, , roadCode, underground, main, sub, roadMgtNo, buildingMgtNo, code] = fields;
  const mainNo = toInt(main);
  const subNo = toInt(sub || '0');
  if (!LEGAL_DONG_CODE_PATTERN.test(legalDongCode) || !BUILDING_MGT_NO_PATTERN.test(buildingMgtNo)) return null;
  if (!ROAD_CODE_PATTERN.test(roadCode) || mainNo === null || subNo === null) return null;
  return {
    legalDongCode,
    detailBuildingName: trimOrNull(detailBuildingName),
    roadCode,
    underground: toUnderground(underground),
    mainNo,
    subNo,
    roadMgtNo: trimOrNull(roadMgtNo),
    buildingMgtNo,
    changeReasonCode: trimOrNull(code),
  };
};

// 100001 도로명주소 한글(TH_SGCO_RNADR_MST, 24칸) 한 줄 → 행. 칸 수가 틀리면 null.
// 도로명관리번호|법정동코드|시도명|시군구명|읍면동명|리명|산여부|번지|호|도로명코드|도로명|지하여부|건물본번|건물부번|
// 행정동코드|행정동명|기초구역번호|이전도로명주소|효력발생일|공동주택구분|이동사유코드|건축물대장건물명|시군구용건물명|비고
export const parseRoadAddressLine = (line) => {
  const fields = line.split('|');
  if (fields.length !== LINK_COLUMN_COUNTS.TH_SGCO_RNADR_MST) return null;
  const roadMgtNo = trimOrNull(fields[0]);
  if (!roadMgtNo || !LEGAL_DONG_CODE_PATTERN.test(fields[1])) return null;
  return {
    roadMgtNo,
    legalDongCode: fields[1],
    sidoName: trimOrNull(fields[2]),
    sigunguName: trimOrNull(fields[3]),
    eupmyeondongName: trimOrNull(fields[4]),
    isMountain: fields[6] === '1',
    lotMainNo: toInt(fields[7]),
    lotSubNo: toInt(fields[8] || '0'),
    roadCode: trimOrNull(fields[9]),
    roadName: trimOrNull(fields[10]),
    isApartment: fields[19] === '1' ? true : fields[19] === '0' ? false : null,
    changeReasonCode: trimOrNull(fields[20]),
  };
};

// 100005 도로명(TI_SPRD_RDNM, 21칸) 한 줄 → 행. 도로명코드 = 시군구코드(5) + 도로명번호(7).
// 사용여부(11번 칸) 0 = 사용, 변경이력사유(13번 칸) 0 = 도로명 변경.
export const parseRoadNameLine = (line) => {
  const fields = line.split('|');
  if (fields.length !== LINK_COLUMN_COUNTS.TI_SPRD_RDNM) return null;
  const roadCode = `${fields[0]}${fields[1]}`;
  if (!ROAD_CODE_PATTERN.test(roadCode)) return null;
  return {
    roadCode,
    roadName: trimOrNull(fields[3]),
    inUse: fields[10] === '0',
    changeReason: trimOrNull(fields[12]),
  };
};

// 칸 수가 맞지 않는 줄이 절반을 넘으면 형식이 바뀐 것으로 본다(표 이름 반환, 없으면 null).
export const findFormatChangedTable = (tables) => {
  for (const [name, lines] of Object.entries(tables)) {
    const expected = LINK_COLUMN_COUNTS[name];
    if (!expected || lines.length === 0) continue;
    const bad = lines.filter((line) => line.split('|').length !== expected).length;
    if (bad * 2 > lines.length) return name;
  }
  return null;
};

// 100001 줄 → Map(도로명관리번호 → 행). 같은 번호가 여러 번이면 뒤의 줄, 폐지(63)보다 신규·변동을 우선한다.
export const indexRoadAddresses = (lines) => {
  const map = new Map();
  for (const line of lines) {
    const row = parseRoadAddressLine(line);
    if (!row) continue;
    const current = map.get(row.roadMgtNo);
    if (current && current.changeReasonCode !== '63' && row.changeReasonCode === '63') continue;
    map.set(row.roadMgtNo, row);
  }
  return map;
};

// 기존 연결의 규칙에서 공동주택 여부: LOT만 공동주택일 때 생기는 규칙이라 믿을 수 있다. 그 밖은 모름.
const apartmentFromExisting = (existing) => (existing?.matchRule === 'LOT' ? true : null);

// 동 표시 행 + 맥락 → matchBuilding 입력 행.
// ctx: { roadAddresses: Map(도로명관리번호 → 100001 행), roadKeyByCode: Map(도로명코드 → 도로명 키),
//        regions: Map(읍면동 코드 → { sidoName, sigunguName, dongName }), searched: Map(건물관리번호 → { roadName, isApartment }),
//        existing: Map(건물관리번호 → 연결 행) }
export const toLinkBuildingRow = (dong, ctx) => {
  const address = dong.roadMgtNo ? ctx.roadAddresses?.get(dong.roadMgtNo) : null;
  const searched = ctx.searched?.get(dong.buildingMgtNo) ?? null;
  const existing = ctx.existing?.get(dong.buildingMgtNo) ?? null;
  const region = ctx.regions?.get(rollUpLegalDongCode(dong.legalDongCode)) ?? null;

  const roadName = address?.roadName ?? searched?.roadName ?? null;
  const roadNameKey = roadName ? null : (ctx.roadKeyByCode?.get(dong.roadCode) ?? null);
  const isApartment = address?.isApartment ?? apartmentFromExisting(existing) ?? searched?.isApartment ?? null;
  const sidoName = address?.sidoName ?? region?.sidoName ?? null;
  const sigunguName = address?.sigunguName ?? region?.sigunguName ?? null;
  const eupmyeondongName = address?.eupmyeondongName ?? region?.dongName ?? null;

  return {
    buildingMgtNo: dong.buildingMgtNo,
    legalDongCode: dong.legalDongCode,
    sidoName,
    sigunguName,
    eupmyeondongName,
    isMountain: address ? address.isMountain : false,
    lotMainNo: address ? address.lotMainNo : null,
    lotSubNo: address ? address.lotSubNo : null,
    roadCode: dong.roadCode,
    roadName,
    ...(roadNameKey ? { roadNameKey } : {}),
    underground: dong.underground,
    mainNo: dong.mainNo,
    subNo: dong.subNo,
    changeReasonCode: dong.changeReasonCode,
    isApartment,
    // 주소 글자(시도·시군구·도로명)를 다 만들 수 없으면 단지 주소 칸을 고치지 않는다.
    skipAddress: !roadName || !sidoName || !sigunguName,
  };
};

// 공동주택 여부와 상관없이 K-apt 후보가 있는지(판단 대상인지)
const hasKaptCandidate = (row, lookup) => {
  const key = toBuildingRoadKey(row);
  if (key && lookup.road(roadKeyId(key)).length > 0) return true;
  return toBuildingLotKeyIds(row).some((id) => lookup.lot(id).length > 0);
};

// 같은 건물인데 도로명 키 후보만 없어져서 결과가 없어진 경우(도로명 변경 뒤 K-apt 쪽 이름이 옛 이름인 등)
const isSameAddressAsExisting = (row, existing) =>
  existing &&
  existing.roadCode === row.roadCode &&
  existing.roadUnderground === row.underground &&
  existing.roadMainNo === row.mainNo &&
  existing.roadSubNo === row.subNo;

// 동 표시 줄 → 연산. planDeltaLine과 같은 모양에 unresolved가 더 있다.
// { kind: 'upsert', link, row } | { kind: 'delete', buildingMgtNo, row } | { kind: 'unresolved', buildingMgtNo, row, reason } |
// { kind: 'invalid' } | { kind: 'unknown', code }. relevant: 판단 대상(기존 연결이 있거나 K-apt 후보가 있음).
// ctx.inactiveKaptCodes: 비활성 단지 코드 Set(기존 연결이 비활성 단지를 가리키는지 분류용)
export const planLinkLine = (line, lookup, ctx) => {
  const dong = parseDongLine(line);
  if (!dong) return { kind: 'invalid' };
  const reason = LINK_CHANGE_REASONS[dong.changeReasonCode];
  if (!reason) return { kind: 'unknown', code: dong.changeReasonCode ?? '' };
  const row = toLinkBuildingRow(dong, ctx);
  if (reason === 'DELETE') return { kind: 'delete', buildingMgtNo: dong.buildingMgtNo, row };

  const existing = ctx.existing?.get(dong.buildingMgtNo) ?? null;
  const unresolved = (why) => ({ kind: 'unresolved', buildingMgtNo: dong.buildingMgtNo, row, reason: why, relevant: true });
  const key = toBuildingRoadKey(row);
  if (!key) {
    // 도로명 키를 못 만들면 아무것도 쓰지 않는다(필지만으로 새로 잇지도, 기존 연결을 지우지도 않음).
    const relevant = Boolean(existing) || toBuildingLotKeyIds(row).some((id) => lookup.lot(id).length > 0);
    return { ...unresolved('no road name'), relevant };
  }

  let link;
  if (row.isApartment === null) {
    const asApartment = matchBuilding({ ...row, isApartment: true }, lookup);
    const asOther = matchBuilding({ ...row, isApartment: false }, lookup);
    if ((asApartment?.kaptCode ?? null) !== (asOther?.kaptCode ?? null)) return unresolved('apartment flag unknown');
    link = asOther ?? (asApartment ? { ...asApartment, matchRule: 'NON_APT_FLAG' } : null);
  } else {
    link = matchBuilding(row, lookup);
  }
  const relevant = Boolean(existing) || Boolean(link) || hasKaptCandidate(row, lookup);
  if (link) return { kind: 'upsert', link, row, relevant };

  // 결과가 없어졌지만 기존 연결과 주소(도로명코드·번호)가 같고 도로명 키 후보만 없는 경우: 지우지 않는다.
  if (isSameAddressAsExisting(row, existing) && lookup.road(roadKeyId(key)).length === 0) {
    return unresolved(ctx.inactiveKaptCodes?.has(existing.kaptCode) ? 'kapt inactive' : 'road name changed');
  }
  return { kind: 'delete', buildingMgtNo: dong.buildingMgtNo, row, relevant };
};

// 줄 묶음 → 건물관리번호마다 마지막 연산(판단 대상 수·unresolved 수 계산용)
const lastOpByBuilding = (ops) => {
  const last = new Map();
  for (const op of ops) {
    if (!['upsert', 'delete', 'unresolved'].includes(op.kind)) continue;
    const id = op.kind === 'upsert' ? op.link.buildingMgtNo : op.buildingMgtNo;
    last.set(id, op);
  }
  return last;
};

// unresolved 집계: 분모 = 신규·변동 건물 중 판단 대상(기존 연결 있음 또는 K-apt 후보 있음), 분자 = 그중 unresolved.
// ignored = 판단 대상이 아닌 unresolved(단지와 상관없는 건물이라 몰라도 잃는 것이 없음)
export const summarizeUnresolved = (ops) => {
  let considered = 0;
  let ignored = 0;
  const unresolved = [];
  for (const [buildingMgtNo, op] of lastOpByBuilding(ops)) {
    if (LINK_CHANGE_REASONS[op.row.changeReasonCode] === 'DELETE') continue;
    if (!op.relevant) {
      if (op.kind === 'unresolved') ignored += 1;
      continue;
    }
    considered += 1;
    if (op.kind === 'unresolved') unresolved.push({ buildingMgtNo, reason: op.reason });
  }
  return { considered, unresolved, ignored };
};

// 하루치 검사(쓰기 전). tables: { 표 이름: 줄[] }, ops: 동 표시 연산, existingDeleteCount·totalLinks: 삭제 상한용
export const evaluateLinkGate = ({ tables, ops, existingDeleteCount, totalLinks }) => {
  const changedTable = findFormatChangedTable(tables);
  if (changedTable) return { ok: false, reason: `format changed: ${changedTable}` };
  const unknownCodes = [...new Set(ops.filter((op) => op.kind === 'unknown').map((op) => op.code))].sort();
  if (unknownCodes.length > 0) return { ok: false, reason: `unknown change reason code: ${unknownCodes.join(',')}` };
  const invalidCount = ops.filter((op) => op.kind === 'invalid').length;
  if (ops.length > 0 && invalidCount / ops.length > MAX_PARSE_FAILURE_RATIO) {
    return { ok: false, reason: `parse failures ${invalidCount}/${ops.length}` };
  }
  if (totalLinks > 0 && existingDeleteCount / totalLinks > MAX_DELETE_RATIO) {
    return { ok: false, reason: `too many deletes ${existingDeleteCount}/${totalLinks}` };
  }
  const { considered, unresolved } = summarizeUnresolved(ops);
  if (unresolved.length >= MIN_UNRESOLVED_TO_FAIL && unresolved.length / Math.max(considered, 1) > MAX_UNRESOLVED_RATIO) {
    return { ok: false, reason: `too many unresolved ${unresolved.length}/${considered}` };
  }
  return { ok: true };
};

// 도로명 원문을 못 구한 신규·변동 줄 중 검색해 볼 건물(판단 대상만, 검색어 기준 최대 limit개).
// 반환: [{ buildingMgtNo, roadCode, underground, mainNo, subNo, keyword }] — 검색어는 시도·시군구·읍면동 이름 +
// 건물관리번호의 지번(PNU 본번-부번). 같은 검색어(같은 필지의 여러 동)는 한 번만 부르도록 호출하는 쪽에서 묶는다.
export const pickSearchTargets = (lines, ctx, lookup, limit) => {
  const targets = [];
  const keywords = new Set();
  for (const line of lines) {
    const dong = parseDongLine(line);
    if (!dong || !['ADD', 'CHANGE'].includes(LINK_CHANGE_REASONS[dong.changeReasonCode])) continue;
    const row = toLinkBuildingRow(dong, ctx);
    const needsName = !row.roadName && !row.roadNameKey;
    const needsFlag = row.isApartment === null;
    if (!needsName && !needsFlag) continue;
    const relevant = ctx.existing?.has(dong.buildingMgtNo) || toBuildingLotKeyIds(row).some((id) => lookup.lot(id).length > 0);
    if (!relevant || !row.sidoName || !row.sigunguName) continue;
    const pnu = dong.buildingMgtNo.slice(0, 19);
    const mainLot = Number(pnu.slice(11, 15));
    const subLot = Number(pnu.slice(15, 19));
    const mountain = pnu.slice(10, 11) === '2' ? '산' : '';
    const lot = `${mountain}${mainLot}${subLot ? `-${subLot}` : ''}`;
    if (targets.some((target) => target.buildingMgtNo === dong.buildingMgtNo)) continue;
    const keyword = [row.sidoName, row.sigunguName, row.eupmyeondongName, lot].filter(Boolean).join(' ');
    if (!keywords.has(keyword) && keywords.size >= limit) continue;
    keywords.add(keyword);
    targets.push({
      buildingMgtNo: dong.buildingMgtNo,
      roadCode: dong.roadCode,
      underground: dong.underground,
      mainNo: dong.mainNo,
      subNo: dong.subNo,
      keyword,
    });
  }
  return targets;
};

// juso 검색 행들 → 그 건물의 { roadName, isApartment } 또는 null.
// juso 검색은 도로명주소 하나에 대표 건물 한 행만 돌려주므로(단지의 다른 동은 안 나옴), 건물관리번호가 같거나
// 도로명코드·지하여부·건물 본번·부번이 같은(= 같은 도로명주소) 행을 채택한다. 지번만 같은 다른 주소는 쓰지 않는다.
export const pickSearchedBuilding = (rows, target) => {
  const row =
    rows.find((item) => item.bdMgtSn === target.buildingMgtNo) ??
    rows.find(
      (item) =>
        item.rnMgtSn === target.roadCode &&
        Number(item.buldMnnm) === target.mainNo &&
        Number(item.buldSlno ?? 0) === target.subNo &&
        (item.udrtYn === '1') === (target.underground === true),
    );
  if (!row) return null;
  return {
    roadName: trimOrNull(row.rn),
    isApartment: row.bdKdcd === '1' ? true : row.bdKdcd === '0' ? false : null,
  };
};
