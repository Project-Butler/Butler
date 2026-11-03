// 러너 선택(OWNERSHIP_VERIFICATION_RUNNER). 쓸 수 없으면 null이고, service가 시도 저장 전에 503으로 거절한다.
// 실제 발급만 한다(local·remote). 미설정, Vercel의 local, 세움터·OCR 값이 빠진 local, 설정이 빠진 remote는 쓸 수 없다.
import { createLocalRunner } from './local.js';
import { createRemoteRunner } from './remote.js';

// local이 세움터 로그인과 OCR에 쓰는 값. 하나라도 없으면 발급 오류로 끝나므로 시작 전에 503(준비 중)으로 거절한다.
const LOCAL_REQUIRED_KEYS = ['EAIS_ID', 'EAIS_PW', 'CLOVA_OCR_INVOKE_URL', 'CLOVA_OCR_SECRET'];

export const resolveRunnerKind = (env) => {
  const kind = env.OWNERSHIP_VERIFICATION_RUNNER;
  if (kind === 'local') return env.VERCEL || !LOCAL_REQUIRED_KEYS.every((key) => env[key]) ? null : 'local';
  if (kind === 'remote') return env.OWNERSHIP_VERIFICATION_RUNNER_URL && env.OWNERSHIP_VERIFICATION_RUNNER_SECRET ? 'remote' : null;
  return null;
};

export const selectRunner = (env = process.env) => {
  const kind = resolveRunnerKind(env);
  if (kind === 'local') return createLocalRunner();
  if (kind === 'remote') {
    return createRemoteRunner({ url: env.OWNERSHIP_VERIFICATION_RUNNER_URL, secret: env.OWNERSHIP_VERIFICATION_RUNNER_SECRET });
  }
  return null;
};
