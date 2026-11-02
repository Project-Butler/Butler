import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseComplexBody } from './complexInput.js';

const VALID = {
  name: ' 테스트 아파트 ',
  roadAddress: '서울특별시 노원구 테스트로 1',
  jibunAddress: '',
  legalDongCode: '1135010600',
};

const fieldsOf = (fn) => {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, 'VALIDATION_ERROR');
    return error.details.map((detail) => detail.field);
  }
  assert.fail('VALIDATION_ERROR가 나야 합니다');
};

test('공백은 떼고 빈 값은 null, sourceKey는 선택', () => {
  assert.deepEqual(parseComplexBody(VALID), {
    name: '테스트 아파트',
    jibunAddress: null,
    roadAddress: '서울특별시 노원구 테스트로 1',
    legalDongCode: '1135010600',
    sourceKey: null,
  });
  assert.equal(parseComplexBody({ ...VALID, sourceKey: ' ROAD:1 ' }).sourceKey, 'ROAD:1');
});

test('단지명·법정동코드는 필수, 법정동코드는 10자리 숫자', () => {
  assert.deepEqual(fieldsOf(() => parseComplexBody({ ...VALID, name: ' ', legalDongCode: undefined })), ['name', 'legalDongCode']);
  assert.deepEqual(fieldsOf(() => parseComplexBody({ ...VALID, legalDongCode: '11350106' })), ['legalDongCode']);
});

test('주소는 도로명·지번 중 하나는 있어야 한다', () => {
  assert.deepEqual(fieldsOf(() => parseComplexBody({ ...VALID, roadAddress: null })), ['roadAddress']);
  assert.equal(parseComplexBody({ ...VALID, roadAddress: null, jibunAddress: '중계동 1' }).jibunAddress, '중계동 1');
});

test('길이 제한, 문자열 아닌 값, 허용되지 않은 필드', () => {
  assert.deepEqual(fieldsOf(() => parseComplexBody({ ...VALID, name: 'a'.repeat(101) })), ['name']);
  assert.deepEqual(fieldsOf(() => parseComplexBody({ ...VALID, sourceKey: 1 })), ['sourceKey']);
  assert.deepEqual(fieldsOf(() => parseComplexBody({ ...VALID, kaptCode: 'A1' })), ['kaptCode']);
});
