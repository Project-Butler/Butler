// Created: 2026-11-04 16:55
// 러너 선택. 발급·OCR은 외부 발급 서버가 하고, API는 remote 러너로 요청만 보낸다.
// 발급 서버 주소(OWNERSHIP_VERIFICATION_RUNNER_URL)와 서명 비밀값(OWNERSHIP_VERIFICATION_RUNNER_SECRET)이 둘 다 있어야 쓸 수 있다.
// 쓸 수 없으면 null이고, service가 시도 저장 전에 503으로 거절한다.
import { createRemoteRunner } from './remote.js';

export const selectRunner = (env = process.env) => {
  const url = env.OWNERSHIP_VERIFICATION_RUNNER_URL;
  const secret = env.OWNERSHIP_VERIFICATION_RUNNER_SECRET;
  return url && secret ? createRemoteRunner({ url, secret }) : null;
};
