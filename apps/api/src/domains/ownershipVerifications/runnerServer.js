// remote 실행 서버(Azure Windows VM). API가 서명해 보낸 발급 요청을 메모리 큐로 한 번에 1건만 처리하고(Chrome·세움터 계정 충돌 방지),
// 결과를 서명해 API로 돌려준다. idText·warnings·예외 메시지는 여기서 버린다. 판정과 복호화는 API만 한다.
// 실행: npm run ownership-runner -w apps/api. 공인 포트를 열지 않고 SSH 터널로 잇는다.
import '../../loadEnv.js';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { toRunnerResult } from '../../platform/ownershipVerificationRules.js';
import { isUuid } from '../../platform/uuid.js';
import { buildSignedHeaders, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRunnerSignature } from './runnerSignature.js';
import { loadLedgerTools, runLedgerIssue } from './runners/local.js';

const RUNNER_HOST = '127.0.0.1';
const RUNNER_PORT = 4100;
const CALLBACK_TIMEOUT_MS = 15_000;

const isOptionalString = (value) => value === null || value === undefined || typeof value === 'string';

const parseJob = (rawBody) => {
  let job;
  try {
    job = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const valid =
    isUuid(job?.attemptId) &&
    typeof job.address === 'string' &&
    isOptionalString(job.dong) &&
    isOptionalString(job.ho) &&
    isOptionalString(job.buildingName);
  return valid ? job : null;
};

export const createRunnerServer = ({ secret, callbackUrl, load = loadLedgerTools, fetchImpl = fetch }) => {
  const queue = [];
  const seenAttemptIds = new Set();
  let draining = null;

  const sendResult = async (attemptId, result) => {
    const body = JSON.stringify({ attemptId, kind: result.kind, ledgerKind: result.ledgerKind, owners: result.owners });
    const url = `${callbackUrl.replace(/\/+$/, '')}/api/v1/ownership-verifications/${attemptId}/result`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildSignedHeaders(secret, body),
      body,
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`callback ${response.status}`);
  };

  const processJob = async ({ attemptId, address, dong, ho, buildingName }) => {
    let result;
    try {
      result = await runLedgerIssue({ address, dong, ho, buildingName }, await load());
    } catch {
      result = toRunnerResult({ issued: { status: 'error' } });
    }
    try {
      await sendResult(attemptId, result);
    } catch (error) {
      console.error('[ownership-runner] 결과 전송 실패', attemptId, error?.name ?? 'unknown');
    }
  };

  const drain = async () => {
    while (queue.length > 0) await processJob(queue.shift());
    draining = null;
  };

  const app = express();
  app.post('/jobs', express.raw({ type: () => true, limit: '16kb' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const isSigned = verifyRunnerSignature({
      secret,
      timestamp: req.get(TIMESTAMP_HEADER),
      signature: req.get(SIGNATURE_HEADER),
      body: rawBody,
    });
    if (!isSigned) return res.status(401).json({ error: { code: 'VERIFICATION_RUNNER_SIGNATURE_INVALID' } });

    const job = parseJob(rawBody);
    if (!job) return res.status(400).json({ error: { code: 'VALIDATION_ERROR' } });

    // 재전송으로 발급이 두 번 신청되지 않게 한다.
    if (!seenAttemptIds.has(job.attemptId)) {
      seenAttemptIds.add(job.attemptId);
      queue.push(job);
      draining ??= drain();
    }
    return res.status(202).json({ data: { attemptId: job.attemptId } });
  });

  return { app, whenIdle: () => draining ?? Promise.resolve() };
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const secret = process.env.OWNERSHIP_VERIFICATION_RUNNER_SECRET;
  const callbackUrl = process.env.OWNERSHIP_VERIFICATION_CALLBACK_URL;
  if (!secret || !callbackUrl) {
    console.error('[ownership-runner] OWNERSHIP_VERIFICATION_RUNNER_SECRET·OWNERSHIP_VERIFICATION_CALLBACK_URL이 필요합니다.');
    process.exit(1);
  }
  createRunnerServer({ secret, callbackUrl }).app.listen(RUNNER_PORT, RUNNER_HOST, () => {
    console.info(`[ownership-runner] ${RUNNER_HOST}:${RUNNER_PORT}`);
  });
}
