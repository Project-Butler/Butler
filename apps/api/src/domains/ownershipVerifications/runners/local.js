// 이 PC(Windows)에서 세움터 발급 + CLOVA OCR을 실행한다. eais/, ocr/는 동적 import로 불러 Vercel 번들에 영향을 주지 않는다.
import { toRunnerResult } from '../../../platform/ownershipVerificationRules.js';

export const loadLedgerTools = async () => {
  const [{ issueLedger }, { extractOwners }] = await Promise.all([import('../eais/issueLedger.js'), import('../ocr/extractOwners.js')]);
  return { issue: issueLedger, extract: extractOwners };
};

// 발급 → 1쪽 OCR → 결과 변환. 예외 메시지와 원문은 버리고 kind만 남긴다. headless로 고정해 사람 대기로 멈추지 않게 한다.
// 실행 서버(runnerServer.js)도 이 함수를 쓴다.
export const runLedgerIssue = async (target, { issue, extract }) => {
  let issued;
  try {
    issued = await issue({ ...target, headless: true });
  } catch {
    return toRunnerResult({ issued: { status: 'error' } });
  }
  if (issued.status !== 'ok') return toRunnerResult({ issued });

  const firstPage = issued.pages?.find((page) => page.page === 1);
  if (!firstPage) return toRunnerResult({ issued: { ...issued, status: 'error' } });

  try {
    const extracted = await extract({ ledgerKind: issued.target.ledgerKind, png: firstPage.png });
    return toRunnerResult({ issued, extracted });
  } catch {
    return toRunnerResult({ issued, ocrFailed: true });
  }
};

export const createLocalRunner = ({ load = loadLedgerTools } = {}) => ({
  kind: 'local',
  awaitDispatch: false,
  run: async (target) => runLedgerIssue(target, await load()),
});
