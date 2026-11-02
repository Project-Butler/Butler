import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseVerificationSettingBody } from '../admin/controller.js';
import { parseEndBody } from '../propertyOwnerships/controller.js';
import { parseStartBody } from './controller.js';

const TODAY = '2026-11-03';
const VALID = { ownershipId: randomUUID(), birthDate: '1980-01-01', consent: true };

const invalidFields = (fn) => {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, 'VALIDATION_ERROR');
    return { fields: error.details.map((detail) => detail.field), text: JSON.stringify(error.details) };
  }
  return assert.fail('400이어야 한다');
};

test('parseStartBody: 정상 입력에서 consent를 뺀 값을 돌려준다', () => {
  assert.deepEqual(parseStartBody(VALID, TODAY), { ownershipId: VALID.ownershipId, birthDate: VALID.birthDate });
});

test('parseStartBody: 동의 없음·미래·없는 날짜·모르는 칸은 400이고 입력값을 담지 않는다', () => {
  for (const consent of [undefined, false, 'true']) {
    assert.deepEqual(invalidFields(() => parseStartBody({ ...VALID, consent }, TODAY)).fields, ['consent']);
  }
  for (const birthDate of ['2026-11-04', '2023-02-30', '19800101', null]) {
    const { fields, text } = invalidFields(() => parseStartBody({ ...VALID, birthDate }, TODAY));
    assert.deepEqual(fields, ['birthDate']);
    if (birthDate) assert.ok(!text.includes(birthDate));
  }
  assert.deepEqual(invalidFields(() => parseStartBody({ ...VALID, ownershipId: 'x' }, TODAY)).fields, ['ownershipId']);
  assert.deepEqual(invalidFields(() => parseStartBody({ ...VALID, name: '김철수' }, TODAY)).fields, ['name']);
});

test('유효기간 입력: 1 이상 정수만', () => {
  assert.deepEqual(parseVerificationSettingBody({ validityYears: 3 }), { validityYears: 3 });
  for (const validityYears of [0, -1, 1.5, '3', null, undefined, 101]) {
    assert.deepEqual(invalidFields(() => parseVerificationSettingBody({ validityYears })).fields, ['validityYears']);
  }
});

test('소유 종료 입력: endReason은 SELF_ENDED 기본, SOLD 허용, 그 밖은 400', () => {
  assert.deepEqual(parseEndBody(undefined), { reason: null, endReason: 'SELF_ENDED' });
  assert.deepEqual(parseEndBody({ reason: ' 매도 ', endReason: 'SOLD' }), { reason: '매도', endReason: 'SOLD' });
  for (const endReason of ['SUPERSEDED', 'ADMIN_ENDED', 'x']) {
    assert.deepEqual(invalidFields(() => parseEndBody({ endReason })).fields, ['endReason']);
  }
});
