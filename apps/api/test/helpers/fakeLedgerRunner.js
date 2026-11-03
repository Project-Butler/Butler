// 테스트 전용 가짜 러너(앱에는 fixture 모드가 없다). 세움터·CLOVA를 부르지 않는다. 호 끝 두 자리로 결과를 고른다(그 밖에는 요청자와 일치).
//   91 불일치 · 92 읽기 실패 · 93 발급 오류 · 94 발급 멈춤 · 95 입력 오류 · 96 OCR 실패 · 97 러너 예외
// 가짜 idText·warnings·reason을 함께 돌려줘 원문이 어디에도 남지 않는지 검사할 수 있게 한다.
import { runLedgerIssue } from '../../src/domains/ownershipVerifications/runners/local.js';

export const FIXTURE_ID_TEXT = '800101-1FIXTURE';
export const FIXTURE_WARNING = 'FIXTURE_WARNING_TEXT';
export const FIXTURE_REASON = 'FIXTURE_REASON_TEXT';

const ISSUE_STATUS_BY_SUFFIX = { 93: 'error', 94: 'stopped', 95: 'invalid' };

const toOwners = (suffix, identity) => {
  if (suffix === '91') return [{ row: 1, name: '픽스처 다른소유자', birthDate: '1900-01-01', idText: FIXTURE_ID_TEXT }];
  if (suffix === '92') return [{ row: 1, name: '', birthDate: null, idText: FIXTURE_ID_TEXT }];
  return [{ row: 1, name: identity?.name ?? '', birthDate: identity?.birthDate ?? null, idText: FIXTURE_ID_TEXT }];
};

// getIdentity(attemptId): 일치 결과로 돌려줄 요청자의 이름·생년월일. 테스트가 DB에서 읽어 넘긴다.
export const createFixtureRunner = ({ getIdentity } = {}) => ({
  kind: 'fake',
  awaitDispatch: false,
  run: async (target, { attemptId } = {}) => {
    const suffix = String(target.ho ?? '').slice(-2);
    if (suffix === '97') throw new Error(`${FIXTURE_REASON} ${FIXTURE_ID_TEXT}`);

    const issue = async () => {
      const status = ISSUE_STATUS_BY_SUFFIX[suffix];
      if (status) return { status, reason: FIXTURE_REASON };
      return { status: 'ok', target: { ledgerKind: 'UNIT_EXCLUSIVE' }, pages: [{ page: 1, png: Buffer.alloc(0) }] };
    };
    const extract = async () => {
      if (suffix === '96') throw new Error(FIXTURE_REASON);
      const identity = getIdentity ? await getIdentity(attemptId) : null;
      return { owners: toOwners(suffix, identity), warnings: [FIXTURE_WARNING] };
    };
    return runLedgerIssue(target, { issue, extract });
  },
});
