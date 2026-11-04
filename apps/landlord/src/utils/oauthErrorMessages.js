// 소셜 로그인이 실패하면 API가 /login?oauth_error=<코드>로 돌려보낸다. 코드를 화면에 보여 줄 문구로 바꾼다.
// 코드는 apps/api의 auth/oauth(oauthController·oauthService·providers)가 정한다. 모르는 코드는 기본 문구를 쓴다.
const OAUTH_ERROR_MESSAGES = {
  OAUTH_DENIED: '소셜 로그인을 취소했습니다. 다시 시도하거나 이메일로 로그인해주세요.',
  OAUTH_STATE_INVALID: '로그인 요청이 만료되었거나 올바르지 않습니다. 처음부터 다시 시도해주세요.',
  OAUTH_EMAIL_REQUIRED: '이메일 제공에 동의해야 소셜 로그인을 사용할 수 있습니다. 동의 화면에서 이메일 항목을 선택해주세요.',
  OAUTH_EMAIL_NOT_VERIFIED: '인증된 이메일이 아니어서 소셜 로그인을 사용할 수 없습니다. 이메일로 가입해주세요.',
  OAUTH_EMAIL_IN_USE: '이미 이 이메일로 가입된 계정이 있습니다. 이메일과 비밀번호로 로그인해주세요.',
  OAUTH_ROLE_NOT_ALLOWED: '임대인 계정만 소셜 로그인을 사용할 수 있습니다.',
  OAUTH_ACCOUNT_CONFLICT: '이미 다른 소셜 계정이 연결된 계정입니다. 처음 연결한 소셜 계정으로 로그인해주세요.',
  OAUTH_PROVIDER_ERROR: '소셜 로그인 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.',
  RATE_LIMITED: '소셜 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
  OAUTH_UNAVAILABLE: '소셜 로그인을 아직 사용할 수 없습니다. 이메일로 로그인해주세요.',
  AUTH_ACCOUNT_SUSPENDED: '정지된 계정입니다. 운영팀에 문의해주세요.',
  AUTH_ACCOUNT_UNAVAILABLE: '사용할 수 없는 계정입니다.',
};

const DEFAULT_MESSAGE = '소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';

// code는 주소에서 오는 값이라 `__proto__`·`constructor` 같은 상속 키가 문구 대신 객체를 돌려주지 않게 자기 키만 본다.
export const getOAuthErrorMessage = (code) => (Object.hasOwn(OAUTH_ERROR_MESSAGES, code) ? OAUTH_ERROR_MESSAGES[code] : DEFAULT_MESSAGE);
