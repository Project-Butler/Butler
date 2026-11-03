// 러너 단위 테스트. 세움터·CLOVA를 부르지 않는다. local·remote·실행 서버는 주입한 가짜만 쓴다.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createRunnerServer } from '../../../../src/domains/ownershipVerifications/runnerServer.js';
import { buildSignedHeaders, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRunnerSignature } from '../../../../src/domains/ownershipVerifications/runnerSignature.js';
import { createFixtureRunner, FIXTURE_ID_TEXT, FIXTURE_REASON, FIXTURE_WARNING } from '../../../../src/domains/ownershipVerifications/runners/fixture.js';
import { resolveRunnerKind, selectRunner } from '../../../../src/domains/ownershipVerifications/runners/index.js';
import { createLocalRunner, runLedgerIssue } from '../../../../src/domains/ownershipVerifications/runners/local.js';
import { createRemoteRunner } from '../../../../src/domains/ownershipVerifications/runners/remote.js';

const SECRET = 'test-secret';
const TARGET = { address: '서울 송파구 신천동 17', dong: '101', ho: '1203', buildingName: '잠실파크리오' };
const REMOTE_ENV = { OWNERSHIP_VERIFICATION_RUNNER: 'remote', OWNERSHIP_VERIFICATION_RUNNER_URL: 'http://runner', OWNERSHIP_VERIFICATION_RUNNER_SECRET: SECRET };

const assertNoRawText = (value) => {
  const text = JSON.stringify(value);
  for (const raw of [FIXTURE_ID_TEXT, FIXTURE_WARNING, FIXTURE_REASON]) assert.ok(!text.includes(raw));
};

test('러너 선택: 미설정·Vercel local·운영 fixture는 쓸 수 없다', () => {
  assert.equal(resolveRunnerKind({}), null);
  assert.equal(resolveRunnerKind({ OWNERSHIP_VERIFICATION_RUNNER: 'etc' }), null);
  assert.equal(resolveRunnerKind({ OWNERSHIP_VERIFICATION_RUNNER: 'fixture' }), 'fixture');
  assert.equal(resolveRunnerKind({ OWNERSHIP_VERIFICATION_RUNNER: 'fixture', VERCEL: '1' }), null);
  assert.equal(resolveRunnerKind({ OWNERSHIP_VERIFICATION_RUNNER: 'fixture', NODE_ENV: 'production' }), null);
  assert.equal(resolveRunnerKind({ OWNERSHIP_VERIFICATION_RUNNER: 'local' }), 'local');
  assert.equal(resolveRunnerKind({ OWNERSHIP_VERIFICATION_RUNNER: 'local', VERCEL: '1' }), null);
  assert.equal(resolveRunnerKind({ ...REMOTE_ENV, VERCEL: '1', NODE_ENV: 'production' }), 'remote');
  assert.equal(resolveRunnerKind({ ...REMOTE_ENV, OWNERSHIP_VERIFICATION_RUNNER_SECRET: '' }), null);
  assert.equal(resolveRunnerKind({ ...REMOTE_ENV, OWNERSHIP_VERIFICATION_RUNNER_URL: '' }), null);
  assert.equal(selectRunner({}), null);
  assert.equal(selectRunner(REMOTE_ENV).kind, 'remote');
  assert.equal(selectRunner(REMOTE_ENV).awaitDispatch, true);
  assert.equal(selectRunner({ OWNERSHIP_VERIFICATION_RUNNER: 'local' }).kind, 'local');
});

test('fixture: 호 끝 두 자리로 결과를 고르고 원문을 돌려주지 않는다', async () => {
  const runner = createFixtureRunner();
  const identity = { name: '김철수', birthDate: '1980-01-01' };
  const run = (ho) => runner.run({ ...TARGET, ho }, { getIdentity: async () => identity });

  const matched = await run('1201');
  assert.deepEqual(matched, { kind: 'OK', ledgerKind: 'UNIT_EXCLUSIVE', owners: [identity] });
  assert.equal((await run('1291')).owners[0].name, '픽스처 다른소유자');
  assert.deepEqual((await run('1292')).owners, [{ name: null, birthDate: null }]);
  assert.equal((await run('1293')).kind, 'ISSUE_FAILED');
  assert.equal((await run('1294')).kind, 'ISSUE_STOPPED');
  assert.equal((await run('1295')).kind, 'ISSUE_INVALID');
  assert.equal((await run('1296')).kind, 'OCR_FAILED');
  await assert.rejects(run('1297'));
  for (const ho of ['1201', '1291', '1292', '1293', '1296']) assertNoRawText(await run(ho));
});

test('local: 주입한 가짜로 발급·1쪽 OCR을 돌린다', async () => {
  const calls = [];
  const png = Buffer.from('page1');
  const runner = createLocalRunner({
    load: async () => ({
      issue: async (input) => {
        calls.push(input);
        return { status: 'ok', target: { ledgerKind: 'UNIT_EXCLUSIVE' }, pages: [{ page: 1, png }], reason: FIXTURE_REASON };
      },
      extract: async (input) => {
        assert.equal(input.png, png);
        assert.equal(input.ledgerKind, 'UNIT_EXCLUSIVE');
        return { owners: [{ name: '김철수', birthDate: '1980-01-01', idText: FIXTURE_ID_TEXT }], warnings: [FIXTURE_WARNING] };
      },
    }),
  });
  assert.equal(runner.awaitDispatch, false);
  const result = await runner.run(TARGET);
  assert.deepEqual(calls, [{ ...TARGET, headless: true }]);
  assert.deepEqual(result, { kind: 'OK', ledgerKind: 'UNIT_EXCLUSIVE', owners: [{ name: '김철수', birthDate: '1980-01-01' }] });
});

test('local: 발급·OCR 예외는 사유 코드로 바뀐다', async () => {
  const failIssue = async () => {
    throw new Error(FIXTURE_REASON);
  };
  const okIssue = async () => ({ status: 'ok', target: { ledgerKind: 'GENERAL' }, pages: [{ page: 1, png: Buffer.alloc(0) }] });
  assert.equal((await runLedgerIssue(TARGET, { issue: failIssue })).kind, 'ISSUE_FAILED');
  assert.equal((await runLedgerIssue(TARGET, { issue: async () => ({ status: 'ok', target: {}, pages: [] }) })).kind, 'ISSUE_FAILED');
  const ocrFailed = await runLedgerIssue(TARGET, { issue: okIssue, extract: failIssue });
  assert.deepEqual(ocrFailed, { kind: 'OCR_FAILED', ledgerKind: 'GENERAL', owners: [] });
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

// 실제 포트에 띄워 서명·큐·결과 전송을 확인한다. 발급은 가짜다.
const withRunnerServer = async (options, fn) => {
  const runner = createRunnerServer({ secret: SECRET, callbackUrl: 'http://api/', ...options });
  const server = await new Promise((resolve) => {
    const listening = runner.app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, runner);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const postJob = (baseUrl, payload, secret = SECRET) => {
  const body = JSON.stringify(payload);
  return fetch(`${baseUrl}/jobs`, { method: 'POST', headers: buildSignedHeaders(secret, body), body });
};

test('실행 서버: 서명이 틀리면 401, 형식이 틀리면 400이고 발급하지 않는다', async () => {
  const load = async () => assert.fail('발급하면 안 된다');
  await withRunnerServer({ load }, async (baseUrl) => {
    assert.equal((await postJob(baseUrl, { attemptId: randomUUID(), ...TARGET }, 'wrong')).status, 401);
    assert.equal((await postJob(baseUrl, { attemptId: 'x', ...TARGET })).status, 400);
  });
});

test('실행 서버: 한 번에 1건, 재전송은 한 번만, 결과에는 원문이 없고 서명이 붙는다', async () => {
  const [first, second] = [randomUUID(), randomUUID()];
  const events = [];
  const callbacks = [];
  let active = 0;
  let maxActive = 0;
  const load = async () => ({
    issue: async ({ address }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push(address);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { status: 'ok', target: { ledgerKind: 'UNIT_EXCLUSIVE' }, pages: [{ page: 1, png: Buffer.alloc(0) }], reason: FIXTURE_REASON };
    },
    extract: async () => ({ owners: [{ name: '김철수', birthDate: '1980-01-01', idText: FIXTURE_ID_TEXT }], warnings: [FIXTURE_WARNING] }),
  });
  const fetchImpl = async (url, init) => {
    callbacks.push({ url, ...init });
    return { ok: true };
  };

  await withRunnerServer({ load, fetchImpl }, async (baseUrl, runner) => {
    assert.equal((await postJob(baseUrl, { attemptId: first, ...TARGET })).status, 202);
    assert.equal((await postJob(baseUrl, { attemptId: first, ...TARGET })).status, 202);
    assert.equal((await postJob(baseUrl, { attemptId: second, ...TARGET, address: '서울 강서구 등촌동 660-9' })).status, 202);
    await runner.whenIdle();
  });

  assert.equal(maxActive, 1);
  assert.deepEqual(events, [TARGET.address, '서울 강서구 등촌동 660-9']);
  assert.equal(callbacks.length, 2);
  assert.equal(callbacks[0].url, `http://api/api/v1/ownership-verifications/${first}/result`);
  assert.deepEqual(JSON.parse(callbacks[0].body), {
    attemptId: first,
    kind: 'OK',
    ledgerKind: 'UNIT_EXCLUSIVE',
    owners: [{ name: '김철수', birthDate: '1980-01-01' }],
  });
  assertNoRawText(callbacks.map((callback) => callback.body));
  const { headers, body } = callbacks[0];
  assert.equal(verifyRunnerSignature({ secret: SECRET, timestamp: headers[TIMESTAMP_HEADER], signature: headers[SIGNATURE_HEADER], body }), true);
});
