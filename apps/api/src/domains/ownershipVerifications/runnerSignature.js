// API와 실행 서버 사이 양방향 HMAC-SHA256 서명. 서명 대상은 `timestamp.body`, 5분이 넘으면 거절한다.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TIMESTAMP_HEADER = 'X-Butler-Timestamp';
export const SIGNATURE_HEADER = 'X-Butler-Signature';
const MAX_SKEW_SECONDS = 5 * 60;

export const signRunnerPayload = (secret, timestamp, body) => createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

export const buildSignedHeaders = (secret, body, nowMs = Date.now()) => {
  const timestamp = String(Math.floor(nowMs / 1000));
  return {
    'Content-Type': 'application/json',
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signRunnerPayload(secret, timestamp, body),
  };
};

// 비밀값이 없으면 항상 거절한다.
export const verifyRunnerSignature = ({ secret, timestamp, signature, body, nowMs = Date.now() }) => {
  if (!secret || typeof timestamp !== 'string' || typeof signature !== 'string' || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return false;

  const expected = Buffer.from(signRunnerPayload(secret, timestamp, body));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
