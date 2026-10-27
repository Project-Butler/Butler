import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKaptLookup } from './jusoBuildingMatcher.js';
import { collapseDeltaOps } from './jusoDeltaApplier.js';
import {
  evaluateLinkGate,
  findFormatChangedTable,
  indexRoadAddresses,
  parseDongLine,
  parseRoadNameLine,
  pickSearchedBuilding,
  pickSearchTargets,
  planLinkLine,
  summarizeUnresolved,
  toLinkBuildingRow,
} from './jusoLinkAdapter.js';

// 서울 노원구 중계동(1135010600) 가짜 건물. 건물관리번호 앞 19자리 = PNU(산 아님, 본번 0500, 부번 0000)
const LEGAL = '1135010600';
const mgt = (n, lot = '05000000') => `${LEGAL}1${lot}${String(n).padStart(6, '0')}`;
const ROAD_CODE = '113504000001';
const ROAD_MGT = '11350106400000100028500000';

const dongLine = ({ n = 1, code = '34', roadCode = ROAD_CODE, main = 285, sub = 0, roadMgt = ROAD_MGT, detail = '101동', lot } = {}) =>
  [LEGAL, '', detail, '', roadCode, '0', String(main), String(sub), roadMgt, mgt(n, lot), code].join('|');

const mstLine = ({ roadMgt = ROAD_MGT, road = '섬밭로', apt = '1', main = 285, lotMain = 500 } = {}) =>
  [roadMgt, LEGAL, '서울특별시', '노원구', '중계동', '', '0', String(lotMain), '0', ROAD_CODE, road, '0', String(main), '0',
    '1135061500', '중계2.3동', '01800', '', '20261022', apt, '34', '', '', ''].join('|');

// K-apt 쪽: 섬밭로 285 → A1, 중계동 500번지 → A2(분양)
const lookup = buildKaptLookup({
  roadLinks: [{ roadSigunguCd: '11350', roadNameKey: '섬밭로', roadUnderground: false, roadMainNo: 285, roadSubNo: 0, kaptCode: 'A1', saleType: '분양' }],
  lots: [{ legalDongCode: LEGAL, mainLot: 500, subLot: 0, kaptCode: 'A2', saleType: '분양' }],
});

const regions = new Map([[LEGAL, { sidoName: '서울특별시', sigunguName: '노원구', dongName: '중계동' }]]);
const ctxWith = (extra = {}) => ({
  roadAddresses: new Map(),
  roadKeyByCode: new Map(),
  regions,
  searched: new Map(),
  existing: new Map(),
  inactiveKaptCodes: new Set(),
  ...extra,
});

const existingLink = (n, extra = {}) => ({
  buildingMgtNo: mgt(n),
  roadSigunguCd: '11350',
  roadNameKey: '섬밭로',
  roadUnderground: false,
  roadMainNo: 285,
  roadSubNo: 0,
  roadCode: ROAD_CODE,
  kaptCode: 'A1',
  matchRule: 'ROAD_KEY',
  ...extra,
});

test('동 표시 11칸 줄 파싱, 칸 수·키가 틀리면 null', () => {
  const row = parseDongLine(dongLine());
  assert.equal(row.buildingMgtNo, mgt(1));
  assert.equal(row.roadCode, ROAD_CODE);
  assert.equal(row.mainNo, 285);
  assert.equal(row.underground, false);
  assert.equal(row.changeReasonCode, '34');
  assert.equal(parseDongLine(`${dongLine()}|extra`), null);
  assert.equal(parseDongLine(dongLine().replace(ROAD_CODE, 'abc')), null);
});

test('도로명 원문·공동주택 여부·대표 지번은 같은 날 100001에서, 이름은 100001 → regions(리 단위 코드는 읍면동으로 올려서)', () => {
  const roadAddresses = indexRoadAddresses([mstLine()]);
  const row = toLinkBuildingRow(parseDongLine(dongLine()), ctxWith({ roadAddresses }));
  assert.equal(row.roadName, '섬밭로');
  assert.equal(row.isApartment, true);
  assert.equal(row.lotMainNo, 500);
  assert.equal(row.skipAddress, false);

  // 100001이 없으면 regions(리 단위 1135010621 → 1135010600)
  const riLine = dongLine().replace(`${LEGAL}|`, '1135010621|');
  const fallback = toLinkBuildingRow(parseDongLine(riLine), ctxWith({ roadKeyByCode: new Map([[ROAD_CODE, '섬밭로']]) }));
  assert.equal(fallback.sidoName, '서울특별시');
  assert.equal(fallback.eupmyeondongName, '중계동');
  assert.equal(fallback.roadName, null);
  assert.equal(fallback.roadNameKey, '섬밭로');
  assert.equal(fallback.isApartment, null);
  assert.equal(fallback.skipAddress, true); // 원문 없음 → 단지 주소 칸 안 고침
  assert.equal(fallback.lotMainNo, null);
});

test('공동주택 여부 출처: 기존 연결은 LOT만 공동주택으로 믿는다, 그다음 검색', () => {
  const dong = parseDongLine(dongLine());
  assert.equal(toLinkBuildingRow(dong, ctxWith({ existing: new Map([[mgt(1), existingLink(1, { matchRule: 'LOT' })]]) })).isApartment, true);
  assert.equal(toLinkBuildingRow(dong, ctxWith({ existing: new Map([[mgt(1), existingLink(1)]]) })).isApartment, null);
  const searched = new Map([[mgt(1), { roadName: '섬밭로', isApartment: false }]]);
  const row = toLinkBuildingRow(dong, ctxWith({ searched }));
  assert.equal(row.isApartment, false);
  assert.equal(row.roadName, '섬밭로');
});

test('정보가 다 있으면 기존 규칙 그대로(ROAD_KEY)', () => {
  const op = planLinkLine(dongLine(), lookup, ctxWith({ roadAddresses: indexRoadAddresses([mstLine()]) }));
  assert.equal(op.kind, 'upsert');
  assert.equal(op.link.kaptCode, 'A1');
  assert.equal(op.link.matchRule, 'ROAD_KEY');
});

test('불변 규칙: 공동주택 여부를 몰라도 두 경우 결과가 같으면 정하고 규칙은 NON_APT_FLAG', () => {
  const op = planLinkLine(dongLine(), lookup, ctxWith({ roadKeyByCode: new Map([[ROAD_CODE, '섬밭로']]) }));
  assert.equal(op.kind, 'upsert');
  assert.equal(op.link.kaptCode, 'A1');
  assert.equal(op.link.matchRule, 'NON_APT_FLAG');
});

test('불변 규칙: 두 경우 결과가 다르면(필지로만 맞음) unresolved — 쓰지 않는다', () => {
  // 다른 도로(후보 없음) + 필지 500번지(A2): 공동주택이면 LOT → A2, 아니면 없음
  const line = dongLine({ roadCode: '113504000099', main: 7 });
  const op = planLinkLine(line, lookup, ctxWith({ roadKeyByCode: new Map([['113504000099', '다른길']]) }));
  assert.equal(op.kind, 'unresolved');
  assert.equal(op.reason, 'apartment flag unknown');
  assert.deepEqual(collapseDeltaOps([op]), { upserts: [], deletes: [], addressRows: [] });
});

test('도로명을 못 구한 34는 기존 연결을 지우지 않는다(unresolved), 폐지 63은 지운다', () => {
  const existing = new Map([[mgt(1), existingLink(1)]]);
  const change = planLinkLine(dongLine({ code: '34' }), lookup, ctxWith({ existing }));
  assert.equal(change.kind, 'unresolved');
  assert.equal(change.reason, 'no road name');
  assert.equal(change.relevant, true);
  const removal = planLinkLine(dongLine({ code: '63' }), lookup, ctxWith({ existing }));
  assert.equal(removal.kind, 'delete');
  assert.deepEqual(collapseDeltaOps([change, removal]).deletes, [mgt(1)]);
});

test('도로명이 바뀐 뒤 34: 주소 번호가 기존 연결과 같고 도로명 키 후보만 없으면 유지(K-apt 단지 비활성이면 따로 분류)', () => {
  const existing = new Map([[mgt(1), existingLink(1, { roadNameKey: '새이름로', kaptCode: 'A1' })]]);
  const roadAddresses = indexRoadAddresses([mstLine({ road: '새이름로', apt: '0' })]);
  const renamed = planLinkLine(dongLine(), lookup, ctxWith({ existing, roadAddresses }));
  assert.equal(renamed.kind, 'unresolved');
  assert.equal(renamed.reason, 'road name changed');
  const inactive = planLinkLine(dongLine(), lookup, ctxWith({ existing, roadAddresses, inactiveKaptCodes: new Set(['A1']) }));
  assert.equal(inactive.reason, 'kapt inactive');
  // 번호가 바뀌었으면(진짜 다른 주소) 지운다
  const moved = planLinkLine(dongLine({ main: 300 }), lookup, ctxWith({ existing, roadAddresses }));
  assert.equal(moved.kind, 'delete');
});

test('모르는 이동사유코드·형식 오류는 게이트 실패', () => {
  const ops = [planLinkLine(dongLine({ code: '72' }), lookup, ctxWith())];
  assert.deepEqual(evaluateLinkGate({ tables: {}, ops, existingDeleteCount: 0, totalLinks: 100 }), {
    ok: false,
    reason: 'unknown change reason code: 72',
  });
  assert.equal(findFormatChangedTable({ TH_RNSPBD_DONG: ['a|b', 'c|d', dongLine()] }), 'TH_RNSPBD_DONG');
  assert.equal(findFormatChangedTable({ TH_RNSPBD_DONG: [dongLine(), dongLine({ n: 2 })], OTHER: ['x'] }), null);
});

test('unresolved 게이트: 판단 대상 중 1% 넘고 5건 이상이면 실패, 판단 대상이 아닌 건물은 세지 않음', () => {
  const existing = new Map(Array.from({ length: 10 }, (_, index) => [mgt(index + 1), existingLink(index + 1)]));
  const noName = (n) => planLinkLine(dongLine({ n }), lookup, ctxWith({ existing }));
  const resolved = (n) => planLinkLine(dongLine({ n }), lookup, ctxWith({ existing, roadAddresses: indexRoadAddresses([mstLine()]) }));
  // 관계없는 건물(기존 연결·후보 없음, 다른 필지) 1,000개는 분모에 안 들어간다
  const unrelated = Array.from({ length: 1000 }, (_, index) =>
    planLinkLine(dongLine({ n: 5000 + index, lot: '09990000' }), lookup, ctxWith()),
  );
  const four = [...[1, 2, 3, 4].map(noName), ...[5, 6, 7, 8, 9, 10].map(resolved), ...unrelated];
  assert.deepEqual(summarizeUnresolved(four).considered, 10);
  assert.equal(evaluateLinkGate({ tables: {}, ops: four, existingDeleteCount: 0, totalLinks: 100 }).ok, true); // 4건 < 5건
  const five = [...[1, 2, 3, 4, 5].map(noName), ...[6, 7, 8, 9, 10].map(resolved), ...unrelated];
  assert.deepEqual(evaluateLinkGate({ tables: {}, ops: five, existingDeleteCount: 0, totalLinks: 100 }), {
    ok: false,
    reason: 'too many unresolved 5/10',
  });
});

test('단지 주소 칸: 도로명 원문이 있을 때만 고친다', () => {
  const withName = planLinkLine(dongLine(), lookup, ctxWith({ roadAddresses: indexRoadAddresses([mstLine()]) }));
  assert.equal(collapseDeltaOps([withName]).addressRows.length, 1);
  const keyOnly = planLinkLine(dongLine(), lookup, ctxWith({ roadKeyByCode: new Map([[ROAD_CODE, '섬밭로']]) }));
  assert.equal(keyOnly.kind, 'upsert');
  assert.equal(collapseDeltaOps([keyOnly]).addressRows.length, 0);
});

test('검색 대상 고르기와 결과 고르기: 판단 대상만, 건물관리번호가 정확히 같은 행만', () => {
  const existing = new Map([[mgt(1), existingLink(1)]]);
  const lines = [dongLine({ n: 1 }), dongLine({ n: 2, lot: '09990000' }), dongLine({ n: 3, code: '63' })];
  const targets = pickSearchTargets(lines, ctxWith({ existing }), lookup, 3);
  assert.deepEqual(targets, [{ buildingMgtNo: mgt(1), keyword: '서울특별시 노원구 중계동 500' }]);
  assert.equal(pickSearchTargets(lines, ctxWith({ existing }), lookup, 0).length, 0);

  const rows = [{ bdMgtSn: mgt(9), rn: '다른로', bdKdcd: '1' }, { bdMgtSn: mgt(1), rn: '섬밭로', bdKdcd: '1' }];
  assert.deepEqual(pickSearchedBuilding(rows, mgt(1)), { roadName: '섬밭로', isApartment: true });
  assert.equal(pickSearchedBuilding(rows, mgt(2)), null);
});

test('도로명(100005) 21칸 줄', () => {
  const line = '11350|4000001|00|새이름로|Saeireum-ro|서울특별시|노원구|1|1135010600|중계동|0|이유||0|Seoul|Nowon-gu|Junggye-dong|1|100|20261026|';
  assert.deepEqual(parseRoadNameLine(line), { roadCode: ROAD_CODE, roadName: '새이름로', inUse: true, changeReason: null });
  assert.equal(parseRoadNameLine('a|b'), null);
});
