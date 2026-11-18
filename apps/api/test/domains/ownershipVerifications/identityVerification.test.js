// Created: 2026-11-17 04:05
// 권리자 인증 전 본인인증 판정·조회(DB·네트워크 없음). 포트원 응답은 가짜 fetch로 흉내 낸다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertIdentityVerified,
  fetchIdentityVerification,
  IDENTITY_VERIFICATION_USE_RETENTION_MS,
  IDENTITY_VERIFICATION_VALID_MS,
  judgeIdentityVerification,
  PURGE_SCHEDULE,
} from '../../../src/domains/ownershipVerifications/identityVerification.js';

const NOW = new Date('2026-11-17T03:00:00.000Z');
const IDENTITY = { name: '김인증', birthDate: '1980-01-01' };

const verification = ({ minutesAgo = 1, ...customer } = {}) => ({
  status: 'VERIFIED',
  id: 'iv-test',
  verifiedAt: new Date(NOW.getTime() - minutesAgo * 60 * 1000).toISOString(),
  verifiedCustomer: { name: IDENTITY.name, birthDate: IDENTITY.birthDate, ci: 'CI_VALUE', ...customer },
});

const judge = (value, options = {}) => judgeIdentityVerification(value, IDENTITY, { now: NOW, ...options });

test('판정: VERIFIED이고 이름·생년월일이 같으면 통과, 이름 공백은 무시한다', () => {
  assert.equal(judge(verification()), null);
  assert.equal(judge(verification({ name: ' 김 인증 ' })), null);
});

test('판정: VERIFIED가 아니거나 인증 시각이 없으면 NOT_VERIFIED', () => {
  assert.equal(judge(null), 'NOT_VERIFIED');
  for (const status of ['READY', 'FAILED']) assert.equal(judge({ ...verification(), status }), 'NOT_VERIFIED');
  assert.equal(judge({ ...verification(), verifiedAt: undefined }), 'NOT_VERIFIED');
});

test('판정: 인증 후 10분이 지나면 EXPIRED', () => {
  assert.equal(judge(verification({ minutesAgo: IDENTITY_VERIFICATION_VALID_MS / 60000 })), null);
  assert.equal(judge(verification({ minutesAgo: IDENTITY_VERIFICATION_VALID_MS / 60000 + 0.1 })), 'EXPIRED');
});

test('판정: 이름·생년월일이 다르거나 비어 있으면 MISMATCH', () => {
  assert.equal(judge(verification({ name: '김다름' })), 'MISMATCH');
  assert.equal(judge(verification({ birthDate: '1980-01-02' })), 'MISMATCH');
  assert.equal(judge(verification({ name: '' })), 'MISMATCH');
  assert.equal(judge(verification({ birthDate: undefined })), 'MISMATCH');
  assert.equal(judgeIdentityVerification(verification(), { name: null, birthDate: null }, { now: NOW }), 'MISMATCH');
});

test('판정: 테스트 모드는 인적사항 대조만 건너뛰고, 미완료·만료는 그대로 거절한다', () => {
  const options = { skipIdentityMatch: true };
  assert.equal(judge(verification({ name: '김다름', birthDate: '1999-09-09' }), options), null);
  assert.equal(judge({ ...verification(), status: 'FAILED' }, options), 'NOT_VERIFIED');
  assert.equal(judge(verification({ minutesAgo: 11 }), options), 'EXPIRED');
});

test('assertIdentityVerified: 사유별 에러 코드·상태, 메시지에 인적사항이 없다', async () => {
  const run = (value, testMode = false) =>
    assertIdentityVerified({ identityVerificationId: 'iv-test', identity: IDENTITY, testMode, now: NOW, lookup: async () => value });

  await run(verification());
  await run(verification({ name: '김다름' }), true);

  const cases = [
    [null, 'IDENTITY_VERIFICATION_NOT_VERIFIED', 422],
    [verification({ minutesAgo: 30 }), 'IDENTITY_VERIFICATION_EXPIRED', 422],
    [verification({ name: '김다름' }), 'IDENTITY_VERIFICATION_MISMATCH', 422],
  ];
  for (const [value, code, status] of cases) {
    await assert.rejects(run(value), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.httpStatus, status);
      assert.ok(!JSON.stringify({ message: error.message, details: error.details }).includes('김다름'));
      return true;
    });
  }
});

// 가짜 fetch: 요청을 기록하고 정해 둔 응답을 돌려준다.
const fakeFetch = (respond) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond();
  };
  return { calls, fetchImpl };
};
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const rejectsUnavailable = (promise) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, 'IDENTITY_VERIFICATION_UNAVAILABLE');
    assert.equal(error.httpStatus, 503);
    return true;
  });

test('조회: API Secret으로 포트원에 직접 묻고 결과 본문을 돌려준다', async () => {
  const body = verification();
  const { calls, fetchImpl } = fakeFetch(() => jsonResponse(200, body));
  const result = await fetchIdentityVerification('iv/test', { env: { PORTONE_API_SECRET: 'secret' }, fetchImpl });
  assert.deepEqual(result, body);
  assert.equal(calls[0].url, 'https://api.portone.io/identity-verifications/iv%2Ftest');
  assert.equal(calls[0].init.headers.Authorization, 'PortOne secret');
});

test('조회: 포트원에 없는 ID(404)는 null, 설정 없음·오류 응답·네트워크 실패는 503', async () => {
  const env = { PORTONE_API_SECRET: 'secret' };
  assert.equal(await fetchIdentityVerification('iv', { env, fetchImpl: fakeFetch(() => jsonResponse(404, {})).fetchImpl }), null);

  const notCalled = fakeFetch(() => jsonResponse(200, {}));
  await rejectsUnavailable(fetchIdentityVerification('iv', { env: {}, fetchImpl: notCalled.fetchImpl }));
  assert.equal(notCalled.calls.length, 0);

  await rejectsUnavailable(fetchIdentityVerification('iv', { env, fetchImpl: fakeFetch(() => jsonResponse(500, {})).fetchImpl }));
  await rejectsUnavailable(fetchIdentityVerification('iv', { env, fetchImpl: fakeFetch(() => jsonResponse(401, {})).fetchImpl }));
  await rejectsUnavailable(
    fetchIdentityVerification('iv', {
      env,
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    }),
  );
  await rejectsUnavailable(fetchIdentityVerification('iv', { env, fetchImpl: fakeFetch(() => new Response('not json', { status: 200 })).fetchImpl }));
});

test('사용 기록 보관 기간은 하루로 유효 시간보다 길고, 정리 일정은 한국 시간 01:00(UTC 16:00)', () => {
  assert.equal(IDENTITY_VERIFICATION_USE_RETENTION_MS, 24 * 60 * 60 * 1000);
  assert.ok(IDENTITY_VERIFICATION_USE_RETENTION_MS > IDENTITY_VERIFICATION_VALID_MS);
  assert.equal(PURGE_SCHEDULE.path, '/api/cron/ownership-identity-verifications');
  assert.equal(PURGE_SCHEDULE.cron, '0 16 * * *');
});
