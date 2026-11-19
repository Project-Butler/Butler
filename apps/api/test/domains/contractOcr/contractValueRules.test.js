// Created: 2026-11-19
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_MEMO_LENGTH,
  parseAmountCandidates,
  parseDateCandidates,
  parsePaymentDayCandidates,
  reviewExtractedValues,
} from '../../../src/domains/contractOcr/contractValueRules.js';

const TEXT = `부동산(주택) 임대차 계약서
임대인과 임차인 쌍방은 아래 표시 부동산에 관하여 다음 계약 내용과 같이 임대차계약을 체결한다.
소재지 서울특별시 노원구 테스트로 1, 101동 1203호
계약의 종류 [ ] 전세 [v] 보증금 있는 월세
보증금 금 일억이천만원정 (₩120,000,000)
차임 금 오십만원정 (₩500,000) 은 매월 25일에 지불한다.
임대차기간은 2026년 3월 1일부터 2028년 2월 29일까지로 한다.
특약사항 1. 반려동물 사육 금지 2. 도배는 임대인 부담
임대인 성명 홍길동
임차인 성명 김임차 전화 010-1234-5678`;

const PROPERTY = { buildingNo: '101', unitNo: '1203' };

const item = (value, source = value) => ({ value, source });

const GOOD = {
  leaseType: item('MONTHLY', '보증금 있는 월세'),
  deposit: item('120000000', '금 일억이천만원정 (₩120,000,000)'),
  monthlyRent: item('500000', '금 오십만원정 (₩500,000)'),
  rentPaymentDay: item('25', '매월 25일'),
  startDate: item('2026-03-01', '2026년 3월 1일'),
  endDate: item('2028-02-29', '2028년 2월 29일'),
  tenantName: item('김임차', '임차인 성명 김임차'),
  tenantPhone: item('01012345678', '010-1234-5678'),
  specialTerms: item('1. 반려동물 사육 금지 2. 도배는 임대인 부담'),
  propertyAddress: item('서울특별시 노원구 테스트로 1, 101동 1203호'),
  landlordName: item('홍길동', '임대인 성명 홍길동'),
};

const review = (extracted, overrides = {}) =>
  reviewExtractedValues({ text: TEXT, extracted, property: PROPERTY, landlordName: '홍길동', ...overrides });

const codesOf = (result) => result.warnings.map(({ field, code }) => `${field ?? '-'}:${code}`);

test('금액 후보: 한글·숫자·섞인 표기를 모두 읽는다', () => {
  assert.ok(parseAmountCandidates('금 일억이천만원정 (₩120,000,000)').has(120_000_000n));
  assert.ok(parseAmountCandidates('1억 2천만원').has(120_000_000n));
  assert.ok(parseAmountCandidates('일금 오천만원정').has(50_000_000n));
  assert.ok(parseAmountCandidates('금 오십만원').has(500_000n));
  assert.ok(parseAmountCandidates('3,000만원').has(30_000_000n));
  assert.ok(!parseAmountCandidates('금 오십만원').has(5_000_000n));
});

test('날짜·납부일 후보', () => {
  assert.ok(parseDateCandidates('2026년 3월 1일').has('2026-03-01'));
  assert.ok(parseDateCandidates('2026. 03. 01.').has('2026-03-01'));
  assert.ok(parsePaymentDayCandidates('매월 25일').has(25));
  assert.ok(parsePaymentDayCandidates('매월 말일').has(31));
  assert.ok(parsePaymentDayCandidates('25').has(25));
});

test('원문 근거가 있는 값은 모두 채우고 경고가 없다', () => {
  const result = review(GOOD);
  assert.deepEqual(result.fields, {
    leaseType: 'MONTHLY',
    deposit: 120_000_000,
    monthlyRent: 500_000,
    rentPaymentDay: 25,
    startDate: '2026-03-01',
    endDate: '2028-02-29',
    tenantName: '김임차',
    tenantPhone: '01012345678',
    memo: '1. 반려동물 사육 금지 2. 도배는 임대인 부담',
  });
  assert.equal(result.memoTruncated, false);
  assert.deepEqual(result.warnings, []);
});

test('원문에 없는 값·source와 다른 값은 비운다', () => {
  const result = review({
    ...GOOD,
    deposit: item('100000000', '금 일억이천만원정 (₩120,000,000)'),
    tenantName: item('이몽룡'),
    startDate: item('2026-03-02', '2026년 3월 1일'),
  });
  assert.equal(result.fields.deposit, null);
  assert.equal(result.fields.tenantName, null);
  assert.equal(result.fields.startDate, null);
  assert.deepEqual(codesOf(result), ['deposit:NO_EVIDENCE', 'startDate:NO_EVIDENCE', 'tenantName:NO_EVIDENCE']);
});

test('값이 아예 없으면 경고 없이 비운다', () => {
  const result = review({ ...GOOD, rentPaymentDay: item(''), tenantPhone: item('') });
  assert.equal(result.fields.rentPaymentDay, null);
  assert.equal(result.fields.tenantPhone, null);
  assert.deepEqual(result.warnings, []);
});

test('종료일이 시작일보다 빠르면 두 칸을 함께 비운다', () => {
  const result = review({ ...GOOD, startDate: item('2028-02-29', '2028년 2월 29일'), endDate: item('2026-03-01', '2026년 3월 1일') });
  assert.equal(result.fields.startDate, null);
  assert.equal(result.fields.endDate, null);
  assert.deepEqual(codesOf(result), ['startDate:INCONSISTENT', 'endDate:INCONSISTENT']);
});

test('전세: 월세 0은 근거 없이 받고, 납부일은 비운다', () => {
  const text = `${TEXT}\n전세 계약`;
  const result = review(
    { ...GOOD, leaseType: item('JEONSE', '전세 계약'), monthlyRent: item('0', '') },
    { text },
  );
  assert.equal(result.fields.leaseType, 'JEONSE');
  assert.equal(result.fields.monthlyRent, 0);
  assert.equal(result.fields.rentPaymentDay, null);
  assert.deepEqual(codesOf(result), ['rentPaymentDay:INCONSISTENT']);
});

test('전세인데 월세가 있으면 유형·금액을 함께 비운다', () => {
  const text = `${TEXT}\n전세 계약`;
  const result = review({ ...GOOD, leaseType: item('JEONSE', '전세 계약'), rentPaymentDay: item('') }, { text });
  assert.equal(result.fields.leaseType, null);
  assert.equal(result.fields.deposit, null);
  assert.equal(result.fields.monthlyRent, null);
});

test('휴대폰은 010 형식만 받는다', () => {
  const text = `${TEXT}\n02-123-4567`;
  const result = review({ ...GOOD, tenantPhone: item('021234567', '02-123-4567') }, { text });
  assert.equal(result.fields.tenantPhone, null);
  assert.deepEqual(codesOf(result), ['tenantPhone:INVALID']);
});

test('특약은 1,000자에서 자르고 잘렸다고 알린다', () => {
  const longTerms = '가'.repeat(MAX_MEMO_LENGTH + 10);
  const result = review({ ...GOOD, specialTerms: item(longTerms) }, { text: `${TEXT}\n${longTerms}` });
  assert.equal(result.fields.memo.length, MAX_MEMO_LENGTH);
  assert.equal(result.memoTruncated, true);
});

test('호실·임대인 대조: 다르면 경고만 하고 값은 채운다', () => {
  const result = review(GOOD, { property: { buildingNo: '102', unitNo: '1203' }, landlordName: '임꺽정' });
  assert.equal(result.fields.deposit, 120_000_000);
  assert.deepEqual(codesOf(result), ['-:UNIT_MISMATCH', '-:LANDLORD_MISMATCH']);
});

test('동 없는 건물은 호만 보고, "101-1203" 표기도 받는다', () => {
  assert.deepEqual(review(GOOD, { property: { buildingNo: '', unitNo: '1203' } }).warnings, []);
  const text = TEXT.replace('101동 1203호', '101-1203');
  const result = review({ ...GOOD, propertyAddress: item('서울특별시 노원구 테스트로 1, 101-1203') }, { text });
  assert.deepEqual(result.warnings, []);
});

test('소재지·임대인을 못 찾으면 알린다', () => {
  const result = review({ ...GOOD, propertyAddress: item(''), landlordName: item('') });
  assert.deepEqual(codesOf(result), ['-:ADDRESS_NOT_FOUND', '-:LANDLORD_NOT_FOUND']);
});

test('LLM 응답 모양이 깨져 있어도 던지지 않고 비운다', () => {
  const result = review({ deposit: 'abc', tenantName: null });
  assert.ok(Object.values(result.fields).every((value) => value === null));
});
