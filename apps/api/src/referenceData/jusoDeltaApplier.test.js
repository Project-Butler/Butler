import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKaptLookup } from './jusoBuildingMatcher.js';
import {
  applyOpsToMap,
  CHANGE_REASONS,
  collapseDeltaOps,
  evaluateDeltaGate,
  planDeltaLine,
  splitDeltaLines,
} from './jusoDeltaApplier.js';

const LOOKUP = buildKaptLookup({
  roadLinks: [
    { roadSigunguCd: '11350', roadNameKey: '섬밭로', roadUnderground: false, roadMainNo: 285, roadSubNo: 0, kaptCode: 'A13986306', saleType: '분양' },
    { roadSigunguCd: '11350', roadNameKey: '동일로207길', roadUnderground: false, roadMainNo: 17, roadSubNo: 0, kaptCode: 'A13986306', saleType: '분양' },
  ],
  lots: [],
});

// mgt: 건물관리번호 끝자리, code: 이동사유코드, road/main: 도로명·본번
const line = ({ mgt, code, road = '섬밭로', main = '285', apt = '1' }) =>
  [
    '1135010600', '서울특별시', '노원구', '중계동', '', '0', '503', '0', '113504154190', road, '0', main, '0', '', '',
    `11350106001050300000000${String(mgt).padStart(2, '0')}`, '01', '', '', '01773', '', '', code, '20261019', '', '', apt,
    '01773', '0', '', '',
  ].join('|');

test('이동사유코드: 31·73 추가, 34 변경, 63·72 삭제(활용가이드 p10)', () => {
  assert.deepEqual(CHANGE_REASONS, { 31: 'ADD', 73: 'ADD', 34: 'CHANGE', 63: 'DELETE', 72: 'DELETE' });
  assert.equal(planDeltaLine(line({ mgt: 1, code: '31' }), LOOKUP).kind, 'upsert');
  assert.equal(planDeltaLine(line({ mgt: 1, code: '73' }), LOOKUP).kind, 'upsert');
  assert.equal(planDeltaLine(line({ mgt: 1, code: '34' }), LOOKUP).kind, 'upsert');
  assert.equal(planDeltaLine(line({ mgt: 1, code: '63' }), LOOKUP).kind, 'delete');
  assert.equal(planDeltaLine(line({ mgt: 1, code: '72' }), LOOKUP).kind, 'delete');
});

test('추가·변경인데 K-apt와 안 맞으면 delete(전에 맞았던 연결을 지움)', () => {
  const op = planDeltaLine(line({ mgt: 1, code: '34', main: '999' }), LOOKUP);
  assert.equal(op.kind, 'delete');
  assert.equal(op.buildingMgtNo, '1135010600105030000000001');
});

test('모르는 이동사유코드는 unknown → 게이트 실패', () => {
  const op = planDeltaLine(line({ mgt: 1, code: '99' }), LOOKUP);
  assert.deepEqual(op, { kind: 'unknown', code: '99' });
  const gate = evaluateDeltaGate({ lineCount: 10, invalidCount: 0, unknownCodes: ['99'], existingDeleteCount: 0, totalLinks: 1000 });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /unknown change reason code: 99/);
});

test('게이트: 칸 수가 대부분 다르면 형식 변경, 파싱 실패 1% 초과, 삭제 2% 초과', () => {
  const base = { lineCount: 1000, invalidCount: 0, unknownCodes: [], existingDeleteCount: 0, totalLinks: 100000 };
  assert.deepEqual(evaluateDeltaGate(base), { ok: true });
  assert.equal(evaluateDeltaGate({ ...base, invalidCount: 600 }).reason, 'format changed');
  assert.match(evaluateDeltaGate({ ...base, invalidCount: 11 }).reason, /parse failures 11\/1000/);
  assert.equal(evaluateDeltaGate({ ...base, invalidCount: 10 }).ok, true);
  assert.match(evaluateDeltaGate({ ...base, existingDeleteCount: 2001 }).reason, /too many deletes/);
  assert.equal(evaluateDeltaGate({ ...base, existingDeleteCount: 2000 }).ok, true);
});

test('NoData(변동 없는 날)는 줄 0개, CRLF·빈 줄 처리', () => {
  assert.deepEqual(splitDeltaLines('No Data'), []);
  assert.deepEqual(splitDeltaLines('NoData'), []);
  assert.deepEqual(splitDeltaLines('NoData\r\n'), []);
  assert.deepEqual(splitDeltaLines('a|b\r\nc|d\r\n\r\n'), ['a|b', 'c|d']);
});

test('묶음 안에서 같은 건물이 여러 번 나오면 뒤의 줄이 이긴다', () => {
  const ops = [
    planDeltaLine(line({ mgt: 1, code: '31' }), LOOKUP),
    planDeltaLine(line({ mgt: 1, code: '63' }), LOOKUP),
    planDeltaLine(line({ mgt: 2, code: '63' }), LOOKUP),
    planDeltaLine(line({ mgt: 2, code: '73', road: '동일로207길', main: '17' }), LOOKUP),
  ];
  const { upserts, deletes } = collapseDeltaOps(ops);
  assert.deepEqual(deletes, ['1135010600105030000000001']);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].buildingMgtNo, '1135010600105030000000002');
  assert.equal(upserts[0].roadMainNo, 17);
});

test('단지 주소 칸 고치기 대상: 추가·변경 줄의 마지막 값(삭제는 제외)', () => {
  const ops = [
    planDeltaLine(line({ mgt: 1, code: '34', road: '동일로207길', main: '17' }), LOOKUP),
    planDeltaLine(line({ mgt: 2, code: '63' }), LOOKUP),
  ];
  const { addressRows } = collapseDeltaOps(ops);
  assert.deepEqual(addressRows.map((row) => row.buildingMgtNo), ['1135010600105030000000001']);
});

test('커서 이어 하기: 묶음 중간에서 멈췄다가 cursor부터 이어도 한 번에 적용한 결과와 같다', () => {
  const lines = [];
  for (let index = 1; index <= 25; index += 1) lines.push(line({ mgt: index, code: '31' }));
  for (let index = 1; index <= 25; index += 3) lines.push(line({ mgt: index, code: '63' }));
  for (let index = 2; index <= 25; index += 4) lines.push(line({ mgt: index, code: '34', road: '동일로207길', main: '17' }));
  for (let index = 3; index <= 25; index += 5) lines.push(line({ mgt: index, code: '34', main: '999' }));
  const ops = lines.map((text) => planDeltaLine(text, LOOKUP));

  const oneShot = applyOpsToMap(new Map(), collapseDeltaOps(ops));

  // 4줄 묶음으로 적용하다 cursor 13에서 멈추고(PARTIAL), 다음 실행이 13부터 이어 한다.
  const resumed = new Map();
  let cursor = 0;
  const runUntil = (stopAt) => {
    while (cursor < ops.length && cursor < stopAt) {
      const end = Math.min(cursor + 4, ops.length);
      applyOpsToMap(resumed, collapseDeltaOps(ops.slice(cursor, end)));
      cursor = end;
    }
  };
  runUntil(13);
  assert.equal(cursor, 16);
  runUntil(Infinity);

  assert.deepEqual([...resumed.entries()].sort(), [...oneShot.entries()].sort());
  // 같은 파일을 처음부터 다시(SHA-1이 달라 0줄부터) 적용해도 결과가 같다(건물관리번호 기준이라 멱등).
  const again = applyOpsToMap(new Map(resumed), collapseDeltaOps(ops));
  assert.deepEqual([...again.entries()].sort(), [...oneShot.entries()].sort());
});
