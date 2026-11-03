import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseVerificationSettingBody } from '../../../src/domains/admin/controller.js';
import { parseEndBody } from '../../../src/domains/propertyOwnerships/controller.js';
import { parseStartBody } from '../../../src/domains/ownershipVerifications/controller.js';

const TODAY = '2026-11-03';
const VALID = { ownershipId: randomUUID(), consent: true };

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
  assert.deepEqual(parseStartBody(VALID), { ownershipId: VALID.ownershipId });
});

test('parseStartBody: 동의 없음·잘못된 id·모르는 칸은 400이고, 생년월일은 받지 않는다', () => {
  for (const consent of [undefined, false, 'true']) {
    assert.deepEqual(invalidFields(() => parseStartBody({ ...VALID, consent })).fields, ['consent']);
  }
  assert.deepEqual(invalidFields(() => parseStartBody({ ...VALID, ownershipId: 'x' })).fields, ['ownershipId']);
  assert.deepEqual(invalidFields(() => parseStartBody({ ...VALID, name: '김철수' })).fields, ['name']);
  const { fields, text } = invalidFields(() => parseStartBody({ ...VALID, birthDate: '1980-01-01' }));
  assert.deepEqual(fields, ['birthDate']);
  assert.ok(!text.includes('1980-01-01'));
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
