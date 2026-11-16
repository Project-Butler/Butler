// 공개 초대 화면(/invite/:token)의 분기 규칙(개발 계획 3-2 상태 표). 화면과 떼어 두어 테스트한다.
// 화면 이름은 시안 번호와 같다:
//   SUMMARY B1 공개 요약 · VERIFY B2 본인 확인 · DAILY_LIMIT B2b 하루 한도 · CONTRACT B3 계약서
//   CONFIRM C2 계약 추가 확인 · ADDED C3 추가 완료
//   UNUSABLE F1 쓸 수 없는 링크 · ACCEPTED_LINK F1(이미 추가된 링크, 로그인 전) · LINKED_OTHER F1(다른 계정이 연결)
//   ALREADY_ADDED F2 이미 추가한 계약 · WRONG_ROLE F3 임차인 계정이 필요 · ERROR 일시 오류
export const SCREEN = {
  LOADING: 'LOADING',
  SUMMARY: 'SUMMARY',
  VERIFY: 'VERIFY',
  DAILY_LIMIT: 'DAILY_LIMIT',
  CONTRACT: 'CONTRACT',
  CONFIRM: 'CONFIRM',
  ADDED: 'ADDED',
  UNUSABLE: 'UNUSABLE',
  ACCEPTED_LINK: 'ACCEPTED_LINK',
  LINKED_OTHER: 'LINKED_OTHER',
  ALREADY_ADDED: 'ALREADY_ADDED',
  WRONG_ROLE: 'WRONG_ROLE',
  ERROR: 'ERROR',
};

// API 오류(toApiError 결과) → 종류. 화면에는 코드를 보여 주지 않고 분기에만 쓴다.
const KIND_BY_CODE = {
  INVITATION_INVALID: 'UNUSABLE',
  INVITATION_EXPIRED: 'UNUSABLE',
  INVITATION_ALREADY_ACCEPTED: 'ALREADY_ACCEPTED',
  CONTRACT_TENANT_ALREADY_LINKED: 'LINKED_OTHER',
  INVITATION_VERIFY_REQUIRED: 'VERIFY_REQUIRED',
  INVITATION_VERIFY_FAILED: 'VERIFY_FAILED',
  INVITATION_VERIFY_RATE_LIMITED: 'RATE_LIMITED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVITATION_VERIFY_DAILY_LIMIT: 'DAILY_LIMIT',
  FORBIDDEN_ROLE: 'WRONG_ROLE',
};

export const toInviteErrorKind = (apiError) => {
  if (!apiError) return 'ERROR';
  if (apiError.code && Object.hasOwn(KIND_BY_CODE, apiError.code)) return KIND_BY_CODE[apiError.code];
  return 'ERROR';
};

// 429 대기 시간. 서버는 details 의 retryAfterSeconds 로 준다. 없으면 null(숫자 없이 "잠시 후" 만).
export const getRetryAfterSeconds = (apiError) => {
  const found = apiError?.details?.find((detail) => Number.isFinite(detail?.retryAfterSeconds));
  return found ? Math.max(0, Math.ceil(found.retryAfterSeconds)) : null;
};

const isTenant = (role) => role === 'TENANT';

// 오류 종류 → 바로 바꿀 화면. null 이면 지금 화면에 문구로 보여 준다(번호 불일치·대기·일시 오류).
export const screenForError = (kind, role) => {
  switch (kind) {
    case 'UNUSABLE':
      return SCREEN.UNUSABLE;
    case 'ALREADY_ACCEPTED':
      return isTenant(role) ? SCREEN.ALREADY_ADDED : SCREEN.ACCEPTED_LINK;
    case 'LINKED_OTHER':
      return SCREEN.LINKED_OTHER;
    case 'WRONG_ROLE':
      return SCREEN.WRONG_ROLE;
    case 'DAILY_LIMIT':
      return SCREEN.DAILY_LIMIT;
    case 'VERIFY_REQUIRED':
      return SCREEN.VERIFY;
    default:
      return null;
  }
};

// 처음 열 때(공개 요약 응답 뒤) 보여 줄 화면.
//   role: 로그인한 사람의 역할(로그인 전 null) · previewKind: 요약 응답이 성공이면 'OK', 아니면 오류 종류
//   joined: 가입·소셜 가입을 마치고 돌아온 표지(?joined=1). 수락이 끝나 요약이 '이미 수락됨'이면 완료 화면(C3)이다.
// 반환 SUMMARY 는 B1, CHECK_SESSION 은 "확인 세션이 살아 있는지 계약서 응답으로 확인"(TENANT) 단계다.
export const CHECK_SESSION = 'CHECK_SESSION';
export const decideInitialScreen = ({ role, previewKind, joined = false }) => {
  if (role && !isTenant(role)) return SCREEN.WRONG_ROLE;
  if (previewKind === 'OK') return isTenant(role) ? CHECK_SESSION : SCREEN.SUMMARY;
  if (previewKind === 'ALREADY_ACCEPTED' && isTenant(role) && joined) return SCREEN.ADDED;
  return screenForError(previewKind, role) ?? SCREEN.ERROR;
};

// 계약서(V-02) 응답 뒤: 확인 세션이 있으면 로그인한 임차인은 C2, 로그인 전이면 B3. 없으면 처음부터(B1 → B2).
export const decideAfterContract = ({ role, contractKind }) => {
  if (contractKind === 'OK') return isTenant(role) ? SCREEN.CONFIRM : SCREEN.CONTRACT;
  if (contractKind === 'VERIFY_REQUIRED') return SCREEN.SUMMARY;
  return screenForError(contractKind, role) ?? SCREEN.ERROR;
};

// 본인 확인(V-01) 실패 처리: { screen } 이면 화면 전환, { message, waitSeconds } 면 B2 에 문구.
export const VERIFY_FAILED_MESSAGE = '번호가 맞지 않아요. 다시 확인해 주세요.';
export const WAIT_MESSAGE = '잠시 후 다시 시도해 주세요.';
export const decideVerifyError = (apiError, role) => {
  const kind = toInviteErrorKind(apiError);
  if (kind === 'VERIFY_FAILED') return { message: VERIFY_FAILED_MESSAGE };
  if (kind === 'RATE_LIMITED') return { message: WAIT_MESSAGE, waitSeconds: getRetryAfterSeconds(apiError) };
  const screen = kind === 'VERIFY_REQUIRED' ? null : screenForError(kind, role);
  if (screen) return { screen };
  return { message: apiError?.message || WAIT_MESSAGE };
};

// 휴대폰 뒤 4자리 입력: 숫자만, 4자리까지.
export const sanitizeLast4 = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 4);

// 화면에 보여 주는 번호 틀. 앞자리는 가리고 입력한 만큼만 채운다: '44' → '010-****-44__'
export const formatPhoneMask = (digits) => `010-****-${sanitizeLast4(digits).padEnd(4, '_')}`;

// 대기 남은 시간 '1분 30초' · '45초'
export const formatWait = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}초`;
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`;
};
