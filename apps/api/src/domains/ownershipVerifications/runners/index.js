// 러너 선택(OWNERSHIP_VERIFICATION_RUNNER). 쓸 수 없으면 null이고, service가 시도 저장 전에 503으로 거절한다.
// 미설정, Vercel의 local, Vercel·production의 fixture, 설정이 빠진 remote는 쓸 수 없다.
import { createFixtureRunner } from './fixture.js';
import { createLocalRunner } from './local.js';
import { createRemoteRunner } from './remote.js';

export const resolveRunnerKind = (env) => {
  const kind = env.OWNERSHIP_VERIFICATION_RUNNER;
  if (kind === 'fixture') return env.VERCEL || env.NODE_ENV === 'production' ? null : 'fixture';
  if (kind === 'local') return env.VERCEL ? null : 'local';
  if (kind === 'remote') return env.OWNERSHIP_VERIFICATION_RUNNER_URL && env.OWNERSHIP_VERIFICATION_RUNNER_SECRET ? 'remote' : null;
  return null;
};

export const selectRunner = (env = process.env) => {
  const kind = resolveRunnerKind(env);
  if (kind === 'fixture') return createFixtureRunner();
  if (kind === 'local') return createLocalRunner();
  if (kind === 'remote') {
    return createRemoteRunner({ url: env.OWNERSHIP_VERIFICATION_RUNNER_URL, secret: env.OWNERSHIP_VERIFICATION_RUNNER_SECRET });
  }
  return null;
};
