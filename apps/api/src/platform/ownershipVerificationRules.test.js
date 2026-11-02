import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTarget } from '../domains/ownershipVerifications/eais/issueCore.js';
import {
  buildJibunAddress,
  buildLedgerTarget,
  canStartInOrder,
  computeVerificationExpiry,
  hasEarlierRevokedOwner,
  isValidBirthDate,
  matchOwner,
  parseRunnerResult,
  parseValidityYears,
  resolveIdentity,
  toRunnerResult,
} from './ownershipVerificationRules.js';

const NOW = new Date('2026-11-03T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2028-01-01T00:00:00Z');
const IDENTITY = { name: '김 철수', birthDate: '1980-01-01' };

test('isValidBirthDate: 형식·실제 날짜·오늘 이하만', () => {
  assert.equal(isValidBirthDate('1980-01-01', '2026-11-03'), true);
  assert.equal(isValidBirthDate('2026-11-03', '2026-11-03'), true);
  assert.equal(isValidBirthDate('2026-11-04', '2026-11-03'), false);
  assert.equal(isValidBirthDate('2023-02-30', '2026-11-03'), false);
  assert.equal(isValidBirthDate('1980-1-1', '2026-11-03'), false);
  assert.equal(isValidBirthDate(19800101, '2026-11-03'), false);
  assert.equal(isValidBirthDate(null, '2026-11-03'), false);
});

test('resolveIdentity: 이름은 가입 정보, 생년월일은 입력', () => {
  assert.deepEqual(resolveIdentity({ name: '김철수' }, { birthDate: '1980-01-01' }), { name: '김철수', birthDate: '1980-01-01' });
  assert.deepEqual(resolveIdentity(null, {}), { name: null, birthDate: null });
});

test('matchOwner: NFC·공백 정규화 후 이름과 생년월일이 모두 같아야 한다', () => {
  assert.equal(matchOwner(IDENTITY, [{ name: '김철수', birthDate: '1980-01-01' }]), 'VERIFIED');
  assert.equal(matchOwner({ name: '김철수'.normalize('NFD'), birthDate: '1980-01-01' }, [{ name: ' 김 철수 ', birthDate: '1980-01-01' }]), 'VERIFIED');
  assert.equal(matchOwner(IDENTITY, [{ name: '이영희', birthDate: '1970-01-01' }, { name: '김철수', birthDate: '1980-01-01' }]), 'VERIFIED');
  assert.equal(matchOwner(IDENTITY, [{ name: '김철수', birthDate: '1980-01-02' }]), 'NOT_MATCHED');
  assert.equal(matchOwner(IDENTITY, [{ name: '김철', birthDate: '1980-01-01' }]), 'NOT_MATCHED');
});

test('matchOwner: null은 일치가 아니다. OCR 쪽 null은 UNREADABLE', () => {
  assert.equal(matchOwner(IDENTITY, []), 'UNREADABLE');
  assert.equal(matchOwner(IDENTITY, null), 'UNREADABLE');
  assert.equal(matchOwner(IDENTITY, [{ name: '김철수', birthDate: null }]), 'UNREADABLE');
  assert.equal(matchOwner(IDENTITY, [{ name: null, birthDate: '1980-01-01' }]), 'UNREADABLE');
  assert.equal(matchOwner({ name: null, birthDate: null }, [{ name: null, birthDate: null }]), 'UNREADABLE');
  assert.equal(matchOwner({ name: '김철수', birthDate: null }, [{ name: '김철수', birthDate: '1980-01-01' }]), 'NOT_MATCHED');
  // 다른 줄이 일치하면 빈 줄이 있어도 인증한다.
  assert.equal(matchOwner(IDENTITY, [{ name: null, birthDate: null }, { name: '김철수', birthDate: '1980-01-01' }]), 'VERIFIED');
});

const row = (id, startedAt, extra = {}) => ({
  id,
  startedAt: new Date(startedAt),
  verificationStatus: 'UNVERIFIED',
  verificationExpiresAt: null,
  ...extra,
});

test('canStartInOrder: 가장 앞선 사람만 시작한다', () => {
  const rows = [row('b', '2026-02-01'), row('a', '2026-01-01')];
  assert.equal(canStartInOrder(rows, 'a', NOW), true);
  assert.equal(canStartInOrder(rows, 'b', NOW), false);
  assert.equal(canStartInOrder(rows, 'x', NOW), false);
});

test('canStartInOrder: 시작 시각이 같으면 id 순서', () => {
  const rows = [row('b', '2026-01-01'), row('a', '2026-01-01')];
  assert.equal(canStartInOrder(rows, 'a', NOW), true);
  assert.equal(canStartInOrder(rows, 'b', NOW), false);
});

test('canStartInOrder: 저장값 VERIFIED인 본인은 면제, 만료된 다른 사람은 빠지고 REVOKED는 남는다', () => {
  const expiredMe = row('b', '2026-02-01', { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST });
  assert.equal(canStartInOrder([row('a', '2026-01-01'), expiredMe], 'b', NOW), true);

  const expiredOther = row('a', '2026-01-01', { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST });
  assert.equal(canStartInOrder([expiredOther, row('b', '2026-02-01')], 'b', NOW), true);

  const validOther = row('a', '2026-01-01', { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE });
  assert.equal(canStartInOrder([validOther, row('b', '2026-02-01')], 'b', NOW), false);

  const revokedOther = row('a', '2026-01-01', { verificationStatus: 'REVOKED' });
  assert.equal(canStartInOrder([revokedOther, row('b', '2026-02-01')], 'b', NOW), false);
});

test('hasEarlierRevokedOwner: 나보다 앞선 REVOKED만 본다', () => {
  const mine = row('b', '2026-02-01');
  assert.equal(hasEarlierRevokedOwner([row('a', '2026-01-01', { verificationStatus: 'REVOKED' }), mine], mine), true);
  assert.equal(hasEarlierRevokedOwner([row('c', '2026-03-01', { verificationStatus: 'REVOKED' }), mine], mine), false);
});

test('buildJibunAddress: 건물명이 붙은 주소도 parseTarget을 통과한다', () => {
  const address = buildJibunAddress({ jibunAddress: '서울특별시 송파구 신천동 17 잠실파크리오', isMountain: false, mainLot: 17, subLot: 0 });
  assert.equal(address, '서울특별시 송파구 신천동 17');
  const parsed = parseTarget({ address, dong: '101', ho: '1203' });
  assert.equal(parsed.query, '서울 송파구 신천동 17');
  assert.equal(parsed.target.ledgerKind, 'UNIT_EXCLUSIVE');
  // 건물명을 지우지 않으면 거절되던 입력이다.
  assert.equal(typeof parseTarget({ address: '서울특별시 송파구 신천동 17 잠실파크리오', dong: '101', ho: '1203' }), 'string');
});

test('buildJibunAddress: 주소는 산인데 칸이 산이 아니면 조립하지 않는다', () => {
  assert.equal(buildJibunAddress({ jibunAddress: '강원특별자치도 정선군 사북읍 산 17', isMountain: null, mainLot: 17 }), null);
  assert.equal(buildJibunAddress({ jibunAddress: '강원특별자치도 정선군 사북읍 산 17', isMountain: false, mainLot: 17 }), null);
});

test('buildJibunAddress: 부번·번지·산 표기', () => {
  assert.equal(buildJibunAddress({ jibunAddress: '서울 강서구 등촌동 660-9', mainLot: 660, subLot: 9 }), '서울 강서구 등촌동 660-9');
  assert.equal(buildJibunAddress({ jibunAddress: '서울 강서구 등촌동 660-9번지 어떤빌라', mainLot: 660, subLot: 9 }), '서울 강서구 등촌동 660-9');
  assert.equal(buildJibunAddress({ jibunAddress: '경기도 양평군 양평읍 산12-3 산장', isMountain: true, mainLot: 12, subLot: 3 }), '경기도 양평군 양평읍 산 12-3');
  assert.equal(buildJibunAddress({ jibunAddress: '경기도 양평군 양평읍 산 12-3', isMountain: true, mainLot: 12, subLot: 3 }), '경기도 양평군 양평읍 산 12-3');
});

test('buildJibunAddress: 조립할 수 없으면 null, 부분 문자열로 찾지 않는다', () => {
  assert.equal(buildJibunAddress({ jibunAddress: null, mainLot: 17 }), null);
  assert.equal(buildJibunAddress({ jibunAddress: '서울 송파구 신천동 17', mainLot: null }), null);
  assert.equal(buildJibunAddress({ jibunAddress: '서울 송파구 신천동 170', mainLot: 17, subLot: 0 }), null);
  assert.equal(buildJibunAddress({ jibunAddress: '서울 송파구 신천동 17-1', mainLot: 17, subLot: 0 }), null);
  assert.equal(buildJibunAddress({ jibunAddress: '17 신천동', mainLot: 17, subLot: 0 }), null);
  assert.equal(buildJibunAddress({ jibunAddress: '서울 송파구 신천동 17', isMountain: true, mainLot: 17, subLot: 0 }), null);
});

test('buildLedgerTarget: 동·호·건물명을 넘기고 개인정보 칸은 없다', () => {
  const property = {
    buildingNo: '101',
    unitNo: '1203',
    complex: { jibunAddress: '서울 송파구 신천동 17 잠실파크리오', mainLot: 17, subLot: 0, buildingName: '잠실파크리오', name: '단지' },
  };
  assert.deepEqual(buildLedgerTarget(property), { address: '서울 송파구 신천동 17', dong: '101', ho: '1203', buildingName: '잠실파크리오' });
  assert.equal(buildLedgerTarget({ ...property, complex: { name: '관리자 단지' } }), null);
});

test('toRunnerResult: 사유 변환, 원문은 버린다', () => {
  const issued = { status: 'ok', target: { ledgerKind: 'GENERAL' }, reason: 'RAW' };
  assert.deepEqual(toRunnerResult({ issued: { status: 'invalid', reason: 'RAW' } }), { kind: 'ISSUE_INVALID', ledgerKind: null, owners: [] });
  assert.equal(toRunnerResult({ issued: { status: 'stopped' } }).kind, 'ISSUE_STOPPED');
  assert.equal(toRunnerResult({ issued: { status: 'error' } }).kind, 'ISSUE_FAILED');
  assert.equal(toRunnerResult({ issued: null }).kind, 'ISSUE_FAILED');
  assert.deepEqual(toRunnerResult({ issued, ocrFailed: true }), { kind: 'OCR_FAILED', ledgerKind: 'GENERAL', owners: [] });
  assert.deepEqual(toRunnerResult({ issued, extracted: { owners: [], warnings: ['RAW'] } }), { kind: 'UNREADABLE', ledgerKind: 'GENERAL', owners: [] });

  const result = toRunnerResult({
    issued,
    extracted: { owners: [{ row: 1, name: '김철수', birthDate: '1980-01-01', idText: '800101-1', nameConfidence: 1 }, { name: '', birthDate: null }], warnings: ['RAW'] },
  });
  assert.deepEqual(result, { kind: 'OK', ledgerKind: 'GENERAL', owners: [{ name: '김철수', birthDate: '1980-01-01' }, { name: null, birthDate: null }] });
  assert.ok(!JSON.stringify(result).includes('RAW') && !JSON.stringify(result).includes('800101'));
});

test('parseRunnerResult: 허용한 모양만 받는다', () => {
  assert.deepEqual(parseRunnerResult({ kind: 'OK', ledgerKind: 'GENERAL', owners: [{ name: '김철수', birthDate: '1980-01-01' }] }), {
    kind: 'OK',
    ledgerKind: 'GENERAL',
    owners: [{ name: '김철수', birthDate: '1980-01-01' }],
  });
  assert.equal(parseRunnerResult({ kind: 'ISSUE_FAILED' }).kind, 'ISSUE_FAILED');
  for (const bad of [
    null,
    [],
    {},
    { kind: 'TIMED_OUT' },
    { kind: 'OK', ledgerKind: 'X' },
    { kind: 'OK', owners: 'x' },
    { kind: 'OK', owners: [{ name: 'a', birthDate: null, idText: '800101' }] },
    { kind: 'OK', owners: [{ name: 1, birthDate: null }] },
    { kind: 'OK', owners: [{ name: 'a', birthDate: '19800101' }] },
    { kind: 'OK', owners: Array(11).fill({ name: 'a', birthDate: null }) },
  ]) {
    assert.equal(parseRunnerResult(bad), null);
  }
});

test('유효기간: 1 이상 정수, 저장값이 잘못되면 null', () => {
  assert.equal(parseValidityYears('3'), 3);
  assert.equal(parseValidityYears(1), 1);
  for (const bad of [0, -1, 1.5, '1.5', 'x', null, undefined, 101]) assert.equal(parseValidityYears(bad), null);
  assert.equal(computeVerificationExpiry(NOW, 3).toISOString(), '2029-11-03T00:00:00.000Z');
});
