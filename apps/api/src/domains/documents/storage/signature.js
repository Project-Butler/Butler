// 임시 로컬 저장소의 서명 주소 토큰. 권리자 인증 실행 서버 서명(runnerSignature.js)과 같은 HMAC-SHA256 방식이다.
// 토큰 = `만료(초).서명`, 서명 대상 = `용도:id:만료`. 용도가 달라 업로드 토큰으로 다운로드할 수 없다.
import { createHmac, timingSafeEqual } from 'node:crypto';

const sign = (secret, purpose, id, expSeconds) => createHmac('sha256', secret).update(`${purpose}:${id}:${expSeconds}`).digest('hex');

export const createStorageToken = ({ secret, purpose, id, expiresAt }) => {
  const expSeconds = Math.floor(expiresAt.getTime() / 1000);
  return `${expSeconds}.${sign(secret, purpose, id, expSeconds)}`;
};

// 'ok' | 'expired' | 'invalid'. 비밀값이 없으면 항상 invalid. 만료는 서명이 맞을 때만 알려 준다.
export const verifyStorageToken = ({ secret, purpose, id, token, nowMs }) => {
  if (!secret || typeof token !== 'string') return 'invalid';
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return 'invalid';
  const expected = Buffer.from(sign(secret, purpose, id, match[1]));
  const actual = Buffer.from(match[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 'invalid';
  return nowMs / 1000 > Number(match[1]) ? 'expired' : 'ok';
};
