// 실행 서버(runnerServer.js)에 발급을 맡긴다. 생년월일과 사용자 이름은 보내지 않는다. 결과는 결과 수신 경로로 돌아온다.
// 서버리스에서 응답 뒤 실행이 유실되지 않도록 전송을 기다린 뒤 응답한다(awaitDispatch).
import { toRunnerResult } from '../../../platform/ownershipVerificationRules.js';
import { buildSignedHeaders } from '../runnerSignature.js';

const DISPATCH_TIMEOUT_MS = 10_000;

export const createRemoteRunner = ({ url, secret, fetchImpl = fetch }) => ({
  kind: 'remote',
  awaitDispatch: true,
  run: async (target, { attemptId }) => {
    const body = JSON.stringify({
      attemptId,
      address: target.address,
      dong: target.dong,
      ho: target.ho,
      buildingName: target.buildingName,
    });
    try {
      const response = await fetchImpl(`${url.replace(/\/+$/, '')}/jobs`, {
        method: 'POST',
        headers: buildSignedHeaders(secret, body),
        body,
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      return response.ok ? { kind: 'DISPATCHED' } : toRunnerResult({ issued: { status: 'error' } });
    } catch {
      return toRunnerResult({ issued: { status: 'error' } });
    }
  },
});
