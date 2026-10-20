import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateExcelGate, groupExcelRows, toApprovalDate, toExcelWrite, toHeaderIndex } from './kaptExcel.js';

// exceljs row.values 모양(1부터 시작, 0번은 비어 있음)
const HEADER = [undefined, '시도', '시군구', '읍면', '동리', '단지코드', '단지명', '단지분류', '법정동주소', '우편번호', '도로명주소', '분양형태', '사용승인일', '가입일', '동수', '세대수'];
const JUNGGYE_LOTS = '서울특별시 노원구 중계동 504-1,서울특별시 노원구 중계동 503,서울특별시 노원구 중계동 502-1 중계그린';
const row = (code, name, jibun, road, sale, date = 19900903, dong = 25, households = 3481) => [
  undefined, '서울특별시', '노원구', '', '중계동', code, name, '아파트', jibun, '01778', road, sale, date, 20090511, dong, households,
];

test('머리글: 필요한 칸 위치를 찾고, 없으면 형식 변경', () => {
  const index = toHeaderIndex(HEADER);
  assert.equal(index.kaptCode, 5);
  assert.equal(index.roadAddress, 10);
  assert.throws(() => toHeaderIndex(HEADER.filter((value) => value !== '분양형태')), /format changed: missing headers 분양형태/);
});

test('같은 단지코드의 여러 줄 → 도로명주소를 모두 모아 연결 행 3개(중계그린)', () => {
  const index = toHeaderIndex(HEADER);
  const groups = groupExcelRows(
    [
      row('A13986306', '중계그린', JUNGGYE_LOTS, '서울특별시 노원구 동일로207길 17', '분양'),
      row('A13986306', '중계그린', JUNGGYE_LOTS, '서울특별시 노원구 섬밭로 285', '분양'),
      row('A13986306', '중계그린', JUNGGYE_LOTS, '서울특별시 노원구 동일로207길 18', '분양'),
      row('A13986306', '중계그린', JUNGGYE_LOTS, '서울특별시 노원구 동일로207길 18', '분양'),
    ],
    index,
  );
  assert.equal(groups.size, 1);
  const write = toExcelWrite(groups.get('A13986306'), '1135010600');
  assert.deepEqual(
    write.links.map((link) => `${link.sigunguCd} ${link.roadNameKey} ${link.mainNo}`),
    ['11350 동일로207길 17', '11350 섬밭로 285', '11350 동일로207길 18'],
  );
  assert.equal(write.columns.saleType, '분양');
  assert.equal(write.columns.approvalDate, '1990-09-03');
  assert.equal(write.columns.mainLot, 504);
  assert.equal(write.columns.subLot, 1);
  assert.equal(write.columns.householdCount, 3481);
  assert.equal(write.columns.buildingCount, 25);
});

test('도로명주소가 비었거나 못 읽으면 연결 행 없음(기본정보 칸은 씀)', () => {
  const index = toHeaderIndex(HEADER);
  const groups = groupExcelRows([row('A1', '테스트', '서울특별시 노원구 중계동 1', '', '임대', '1990-01-01', '1.0', '150.0')], index);
  const write = toExcelWrite(groups.get('A1'), '1135010600');
  assert.deepEqual(write.links, []);
  assert.equal(write.columns.saleType, '임대');
  assert.equal(write.columns.approvalDate, '1990-01-01');
  assert.equal(write.columns.householdCount, 150);
});

test('사용승인일: 8자리 날짜만', () => {
  assert.equal(toApprovalDate(20040517), '2004-05-17');
  assert.equal(toApprovalDate('20041341'), null);
  assert.equal(toApprovalDate(''), null);
});

test('엑셀 게이트: 실측(22,558줄, 99.7%) 통과, 절반 파일·파싱률 95% 미만 실패', () => {
  assert.deepEqual(evaluateExcelGate({ rowsRead: 22_558, parsedRate: 0.9968 }), { ok: true });
  assert.match(evaluateExcelGate({ rowsRead: 11_279, parsedRate: 0.9968 }).reason, /rows read 11279 < 20000/);
  assert.match(evaluateExcelGate({ rowsRead: 22_558, parsedRate: 0.9 }).reason, /parsed rate 90.0%/);
});

test('엑셀 게이트(다시 돌릴 때): 지난 성공 대비 5%p 넘게 하락·읽은 줄 90% 미만이면 실패', () => {
  const last = { rowsRead: 22_558, parsedRate: 0.9968 };
  assert.equal(evaluateExcelGate({ rowsRead: 22_600, parsedRate: 0.99 }, last).ok, true);
  assert.equal(evaluateExcelGate({ rowsRead: 22_600, parsedRate: 0.951 }, { ...last, parsedRate: 1.01 }).ok, false);
  assert.match(evaluateExcelGate({ rowsRead: 20_100, parsedRate: 0.99 }, last).reason, /below 90%/);
});
