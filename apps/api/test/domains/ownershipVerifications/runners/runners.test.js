// 러너 단위 테스트. 외부 발급 서버를 부르지 않는다. remote는 주입한 가짜 fetch만 쓴다.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildSignedHeaders, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRunnerSignature } from '../../../../src/domains/ownershipVerifications/runnerSignature.js';
import { selectRunner } from '../../../../src/domains/ownershipVerifications/runners/index.js';
import { createRemoteRunner } from '../../../../src/domains/ownershipVerifications/runners/remote.js';

const SECRET = 'test-secret';
const TARGET = { address: '서울 송파구 신천동 17', dong: '101', ho: '1203', buildingName: '잠실파크리오' };
const REMOTE_ENV = { OWNERSHIP_VERIFICATION_RUNNER_URL: 'http://runner', OWNERSHIP_VERIFICATION_RUNNER_SECRET: SECRET };

test('러너 선택: 발급 서버 주소와 서명 비밀값이 둘 다 있어야 remote를 쓴다', () => {
  assert.equal(selectRunner({}), null);
  assert.equal(selectRunner({ ...REMOTE_ENV, OWNERSHIP_VERIFICATION_RUNNER_SECRET: '' }), null);
  assert.equal(selectRunner({ ...REMOTE_ENV, OWNERSHIP_VERIFICATION_RUNNER_URL: '' }), null);
  const runner = selectRunner({ ...REMOTE_ENV, VERCEL: '1', NODE_ENV: 'production' });
  assert.equal(runner.kind, 'remote');
  assert.equal(runner.awaitDispatch, true);
});

test('서명: 맞는 값만, 5분 넘으면·비밀값 없으면 거절', () => {
  const nowMs = 1_800_000_000_000;
  const body = '{"a":1}';
  const headers = buildSignedHeaders(SECRET, body, nowMs);
  const input = { secret: SECRET, timestamp: headers[TIMESTAMP_HEADER], signature: headers[SIGNATURE_HEADER], body, nowMs };
  assert.equal(verifyRunnerSignature(input), true);
  assert.equal(verifyRunnerSignature({ ...input, body: '{"a":2}' }), false);
  assert.equal(verifyRunnerSignature({ ...input, secret: 'other' }), false);
  assert.equal(verifyRunnerSignature({ ...input, secret: '' }), false);
  assert.equal(verifyRunnerSignature({ ...input, secret: undefined }), false);
  assert.equal(verifyRunnerSignature({ ...input, signature: 'short' }), false);
  assert.equal(verifyRunnerSignature({ ...input, timestamp: undefined }), false);
  assert.equal(verifyRunnerSignature({ ...input, nowMs: nowMs + 5 * 60 * 1000 + 2000 }), false);
  assert.equal(verifyRunnerSignature({ ...input, nowMs: nowMs + 4 * 60 * 1000 }), true);
});

test('remote: 서명해 보내고 생년월일·이름을 넣지 않는다. 전송 실패는 ISSUE_FAILED', async () => {
  const attemptId = randomUUID();
  let sent;
  const runner = createRemoteRunner({
    url: 'http://runner/',
    secret: SECRET,
    fetchImpl: async (url, init) => {
      sent = { url, ...init };
      return { ok: true };
    },
  });
  const result = await runner.run(TARGET, { attemptId, getIdentity: async () => assert.fail('호출하면 안 된다') });
  assert.deepEqual(result, { kind: 'DISPATCHED' });
  assert.equal(sent.url, 'http://runner/jobs');
  assert.deepEqual(JSON.parse(sent.body), { attemptId, ...TARGET });
  assert.equal(
    verifyRunnerSignature({ secret: SECRET, timestamp: sent.headers[TIMESTAMP_HEADER], signature: sent.headers[SIGNATURE_HEADER], body: sent.body }),
    true,
  );

  const rejected = createRemoteRunner({ url: 'http://runner', secret: SECRET, fetchImpl: async () => ({ ok: false }) });
  assert.equal((await rejected.run(TARGET, { attemptId })).kind, 'ISSUE_FAILED');
  const thrown = createRemoteRunner({
    url: 'http://runner',
    secret: SECRET,
    fetchImpl: async () => {
      throw new Error('down');
    },
  });
  assert.equal((await thrown.run(TARGET, { attemptId })).kind, 'ISSUE_FAILED');
});
