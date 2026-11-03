import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptField, encryptField } from '../../src/platform/fieldCrypto.js';

const KEY = 'a'.repeat(64);

const withKey = (key, fn) => {
  const previous = process.env.FIELD_ENCRYPTION_KEY;
  if (key === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = key;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
    else process.env.FIELD_ENCRYPTION_KEY = previous;
  }
};

test('암호화한 값은 평문이 보이지 않고, 복호화하면 원래 값이다', () =>
  withKey(KEY, () => {
    const stored = encryptField('01012345678');
    assert.ok(stored.startsWith('enc:v1:'));
    assert.ok(!stored.includes('01012345678'));
    assert.equal(decryptField(stored), '01012345678');
  }));

test('같은 값도 매번 다른 암호문이 나온다(iv 무작위)', () =>
  withKey(KEY, () => assert.notEqual(encryptField('01012345678'), encryptField('01012345678'))));

test('키가 없거나 형식이 틀리면 암호화는 실패한다(평문 저장 금지)', () => {
  withKey(undefined, () => assert.throws(() => encryptField('x'), { code: 'INTERNAL_ERROR' }));
  withKey('short', () => assert.throws(() => encryptField('x'), { code: 'INTERNAL_ERROR' }));
});

test('암호화 도입 전 평문과 null은 그대로 돌려준다', () =>
  withKey(KEY, () => {
    assert.equal(decryptField('01011112222'), '01011112222');
    assert.equal(decryptField(null), null);
  }));

test('변조되었거나 키가 다른 암호문은 null(응답 전체를 깨뜨리지 않는다)', () => {
  const stored = withKey(KEY, () => encryptField('01012345678'));
  const tampered = `${stored.slice(0, -2)}00`;
  withKey(KEY, () => assert.equal(decryptField(tampered), null));
  withKey('b'.repeat(64), () => assert.equal(decryptField(stored), null));
  withKey(KEY, () => assert.equal(decryptField('enc:v1:zz'), null));
});
