import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRegisterBody, PASSWORD_MAX_BYTES } from '../../../src/domains/auth/registerValidation.js';

const valid = () => ({
  email: 'New.User@Example.com',
  password: 'abcd1234',
  name: '홍길동',
  birthDate: '1990-01-31',
  role: 'LANDLORD',
  termsAgreed: true,
  privacyAgreed: true,
});

const failsOn = (body, field) => {
  try {
    parseRegisterBody(body);
  } catch (error) {
    assert.equal(error.code, 'VALIDATION_ERROR', `${field}: ${error.code}`);
    assert.equal(error.httpStatus, 400);
    return error.details.map((detail) => detail.field).includes(field);
  }
  return false;
};

test('정상 입력: 이메일은 소문자·트림, 이름은 공백 정리, 휴대폰은 없으면 null, 생년월일은 그대로', () => {
  const result = parseRegisterBody({ ...valid(), email: '  New.User@Example.com ', name: '  홍   길동 ' });
  assert.deepEqual(result, {
    email: 'new.user@example.com',
    password: 'abcd1234',
    name: '홍 길동',
    phone: null,
    birthDate: '1990-01-31',
    role: 'LANDLORD',
  });
});

test('body가 객체가 아니면 400', () => {
  for (const body of [undefined, null, 'x', 1, []]) {
    assert.throws(() => parseRegisterBody(body), { code: 'VALIDATION_ERROR' });
  }
});

test('허용되지 않은 필드(status, id 등)는 400 — 상태 지정·권한 우회 차단', () => {
  assert.ok(failsOn({ ...valid(), status: 'SUSPENDED' }, 'status'));
  assert.ok(failsOn({ ...valid(), id: 'x' }, 'id'));
  assert.ok(failsOn({ ...valid(), isAdmin: true }, 'isAdmin'));
});

test('이메일: 빈 값·형식 오류·너무 긴 값·연속 점·한글 거부', () => {
  assert.ok(failsOn({ ...valid(), email: '' }, 'email'));
  assert.ok(failsOn({ ...valid(), email: undefined }, 'email'));
  assert.ok(failsOn({ ...valid(), email: 123 }, 'email'));
  assert.ok(failsOn({ ...valid(), email: ['a@b.com'] }, 'email'));
  for (const email of ['abc', 'a@b', 'a@@b.com', 'a b@c.com', '@c.com', 'a@.com', 'a..b@c.com', 'a@b..com', '가나@c.com']) {
    assert.ok(failsOn({ ...valid(), email }, 'email'), email);
  }
  assert.ok(failsOn({ ...valid(), email: `${'a'.repeat(250)}@b.com` }, 'email'));
  assert.ok(failsOn({ ...valid(), email: `${'a'.repeat(65)}@b.com` }, 'email'));
});

test('이메일: 플러스 태그와 서브도메인은 허용', () => {
  assert.equal(parseRegisterBody({ ...valid(), email: 'a+tag@mail.example.co.kr' }).email, 'a+tag@mail.example.co.kr');
});

test('비밀번호 정책: 8자 미만·영문 또는 숫자 누락·72바이트 초과·이메일과 동일 거부', () => {
  assert.ok(failsOn({ ...valid(), password: 'abc123' }, 'password'));
  assert.ok(failsOn({ ...valid(), password: 'abcdefgh' }, 'password'));
  assert.ok(failsOn({ ...valid(), password: '12345678' }, 'password'));
  assert.ok(failsOn({ ...valid(), password: undefined }, 'password'));
  assert.ok(failsOn({ ...valid(), password: 12345678 }, 'password'));
  assert.ok(failsOn({ ...valid(), password: `a1${'x'.repeat(PASSWORD_MAX_BYTES)}` }, 'password'));
  // 한글은 글자당 3바이트라 26자(78바이트)는 72바이트를 넘는다
  assert.ok(failsOn({ ...valid(), password: `a1${'가'.repeat(24)}` }, 'password'));
  assert.ok(failsOn({ ...valid(), email: 'abcd1234@x.com', password: 'abcd1234@x.com' }, 'password')); // secret-guard:allow 테스트용 가짜 비밀번호
  assert.ok(failsOn({ ...valid(), password: 'abcd\u00001234' }, 'password')); // secret-guard:allow 테스트용 가짜 비밀번호
});

test('비밀번호: 경계값(8자, 정확히 72바이트)과 공백·특수문자는 허용, 앞뒤 공백을 자르지 않는다', () => {
  assert.equal(parseRegisterBody({ ...valid(), password: 'abcdefg1' }).password, 'abcdefg1');
  const exact = `a1${'x'.repeat(PASSWORD_MAX_BYTES - 2)}`;
  assert.equal(parseRegisterBody({ ...valid(), password: exact }).password, exact);
  assert.equal(parseRegisterBody({ ...valid(), password: ' pass word 1 !' }).password, ' pass word 1 !');
});

test('이름: 빈 값·공백뿐·너무 김·제어문자·제로폭 문자 거부, 50자는 허용', () => {
  assert.ok(failsOn({ ...valid(), name: '' }, 'name'));
  assert.ok(failsOn({ ...valid(), name: '   ' }, 'name'));
  assert.ok(failsOn({ ...valid(), name: undefined }, 'name'));
  assert.ok(failsOn({ ...valid(), name: { a: 1 } }, 'name'));
  assert.ok(failsOn({ ...valid(), name: '가'.repeat(51) }, 'name'));
  assert.ok(failsOn({ ...valid(), name: '홍\u0007길동' }, 'name'));
  assert.ok(failsOn({ ...valid(), name: '홍​길동' }, 'name'));
  assert.ok(failsOn({ ...valid(), name: '홍�길동' }, 'name'));
  assert.equal(parseRegisterBody({ ...valid(), name: '가'.repeat(50) }).name.length, 50);
});

test('휴대폰: 생략·null·빈 문자열은 null, 하이픈·공백은 제거해 숫자만', () => {
  for (const phone of [undefined, null, '', '   ']) {
    assert.equal(parseRegisterBody({ ...valid(), phone }).phone, null);
  }
  assert.equal(parseRegisterBody({ ...valid(), phone: '010-1234-5678' }).phone, '01012345678');
  assert.equal(parseRegisterBody({ ...valid(), phone: ' 010 123 4567 ' }).phone, '0101234567');
  assert.equal(parseRegisterBody({ ...valid(), phone: '011-123-4567' }).phone, '0111234567');
});

test('휴대폰: 번호 형식이 아니면 거부(지역번호·자리수·문자·숫자 타입)', () => {
  for (const phone of ['02-1234-5678', '010-123-456', '010123456789', '01012345678a', '+82 10 1234 5678', '0121234567']) {
    assert.ok(failsOn({ ...valid(), phone }, 'phone'), phone);
  }
  assert.ok(failsOn({ ...valid(), phone: 1012345678 }, 'phone'));
  assert.ok(failsOn({ ...valid(), phone: ['01012345678'] }, 'phone'));
});

test('생년월일: 앞뒤 공백은 자르고, 경계 날짜(1900-01-01, 윤일, 오늘)는 허용', () => {
  assert.equal(parseRegisterBody({ ...valid(), birthDate: ' 1990-01-31 ' }).birthDate, '1990-01-31');
  assert.equal(parseRegisterBody({ ...valid(), birthDate: '1900-01-01' }).birthDate, '1900-01-01');
  assert.equal(parseRegisterBody({ ...valid(), birthDate: '2000-02-29' }).birthDate, '2000-02-29');
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(parseRegisterBody({ ...valid(), birthDate: today }).birthDate, today);
});

test('생년월일: 생략·빈 값은 필수 오류', () => {
  for (const birthDate of [undefined, null, '', '   ']) {
    assert.ok(failsOn({ ...valid(), birthDate }, 'birthDate'), String(birthDate));
  }
});

test('생년월일: 형식 오류·없는 날짜·1900년 이전·미래·타입 오류 거부', () => {
  const bad = ['19900131', '1990/01/31', '90-01-31', '1990-1-31', '1990-01-31T00:00:00Z', '1990-13-01', '1990-00-10', '1990-02-30', '1999-02-29', '1990-04-31', '1899-12-31', '9999-01-01', '생년월일'];
  for (const birthDate of bad) assert.ok(failsOn({ ...valid(), birthDate }, 'birthDate'), birthDate);
  const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.ok(failsOn({ ...valid(), birthDate: tomorrow }, 'birthDate'));
  for (const birthDate of [19900131, ['1990-01-31'], { y: 1990 }, true]) {
    assert.ok(failsOn({ ...valid(), birthDate }, 'birthDate'));
  }
});

test('약관: true가 아니면(생략·false·"true"·1) 모두 거부, 필드별로 알려준다', () => {
  for (const value of [undefined, false, 'true', 1, null]) {
    assert.ok(failsOn({ ...valid(), termsAgreed: value }, 'termsAgreed'));
    assert.ok(failsOn({ ...valid(), privacyAgreed: value }, 'privacyAgreed'));
  }
});

test('여러 오류는 한 번에 모아서 알려준다', () => {
  try {
    parseRegisterBody({ email: 'x', password: '1', name: '', role: 'LANDLORD' });
    assert.fail('통과하면 안 된다');
  } catch (error) {
    const fields = error.details.map((detail) => detail.field);
    for (const field of ['email', 'password', 'name', 'birthDate', 'termsAgreed', 'privacyAgreed']) assert.ok(fields.includes(field), field);
  }
});

test('role: 없거나 모르는 값·타입 오류는 400', () => {
  for (const role of [undefined, null, '', 'landlord', 'SUPERUSER', 1, ['LANDLORD']]) {
    assert.ok(failsOn({ ...valid(), role }, 'role'), String(role));
  }
});

test('role=ADMIN은 403 ROLE_NOT_ALLOWED — 가입으로 운영자를 만들 수 없다', () => {
  assert.throws(() => parseRegisterBody({ ...valid(), role: 'ADMIN' }), { code: 'ROLE_NOT_ALLOWED', httpStatus: 403 });
  // invitationToken을 같이 보내도 ADMIN 차단이 먼저다
  assert.throws(() => parseRegisterBody({ ...valid(), role: 'ADMIN', invitationToken: 'abc' }), { code: 'ROLE_NOT_ALLOWED' });
});

test('role=TENANT 또는 invitationToken이 있으면 422 — 초대 도메인 전에는 임차인 가입 불가', () => {
  assert.throws(() => parseRegisterBody({ ...valid(), role: 'TENANT' }), {
    code: 'TENANT_INVITATION_UNAVAILABLE',
    httpStatus: 422,
  });
  assert.throws(() => parseRegisterBody({ ...valid(), invitationToken: 'abc' }), { code: 'TENANT_INVITATION_UNAVAILABLE' });
  // 빈 토큰은 없는 것과 같다
  assert.equal(parseRegisterBody({ ...valid(), invitationToken: '' }).role, 'LANDLORD');
  assert.equal(parseRegisterBody({ ...valid(), invitationToken: null }).role, 'LANDLORD');
  assert.ok(failsOn({ ...valid(), invitationToken: 123 }, 'invitationToken'));
});

test('형식 오류가 있으면 role 정책보다 먼저 400으로 알려준다', () => {
  assert.ok(failsOn({ ...valid(), role: 'TENANT', email: 'x' }, 'email'));
});
