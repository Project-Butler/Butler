// POST /auth/register 요청 검증(DB 의존 없음). 잘못된 값은 모두 모아서 한 번에 400 VALIDATION_ERROR로 돌려준다.
import { AppError } from '../../platform/AppError.js';
import { assertAllowedBody, throwIfInvalid } from '../../platform/requestValidation.js';

export const REGISTER_FIELDS = [
  'email',
  'password',
  'name',
  'role',
  'phone',
  'birthDate',
  'termsAgreed',
  'privacyAgreed',
  'invitationToken',
];

const EMAIL_MAX_LENGTH = 254;
// 로컬파트@도메인.TLD. 공백·한글 등 ASCII 밖 문자는 받지 않는다(로그인 normalize와 같은 소문자 기준).
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

// bcrypt는 72바이트 뒤를 조용히 잘라 버린다. 한글·이모지는 글자당 3~4바이트라 글자 수가 아니라 바이트로 제한한다.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const NAME_MAX_LENGTH = 50;
// 제어문자(탭·개행 포함), 제로폭·방향 제어 같은 서식 문자, 줄·문단 구분자는 이름에 넣지 않는다.
// U+FFFD는 UTF-8이 깨진 채 들어왔다는 표시라 받지 않는다.
const INVALID_NAME_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\uFFFD]/u;

// 010/011/016/017/018/019 + 7~8자리. 하이픈은 허용하되 저장은 숫자만.
const MOBILE_PATTERN = /^01[016789]\d{7,8}$/;

export const REGISTERABLE_ROLES = ['LANDLORD'];

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

export const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const validateEmail = (value, details) => {
  if (typeof value !== 'string' || value.trim() === '') {
    details.push({ field: 'email', reason: '이메일을 입력해주세요.' });
    return null;
  }
  const email = normalizeEmail(value);
  if (email.length > EMAIL_MAX_LENGTH || email.split('@')[0].length > 64 || !EMAIL_PATTERN.test(email) || email.includes('..')) {
    details.push({ field: 'email', reason: '이메일 형식이 올바르지 않습니다.' });
    return null;
  }
  return email;
};

const validatePassword = (value, email, details) => {
  if (typeof value !== 'string' || value === '') {
    details.push({ field: 'password', reason: '비밀번호를 입력해주세요.' });
    return null;
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    details.push({ field: 'password', reason: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.` });
    return null;
  }
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) {
    details.push({ field: 'password', reason: '비밀번호가 너무 깁니다. (영문 기준 72자 이하)' });
    return null;
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    details.push({ field: 'password', reason: '비밀번호는 영문과 숫자를 모두 포함해야 합니다.' });
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    details.push({ field: 'password', reason: '비밀번호에 사용할 수 없는 문자가 있습니다.' });
    return null;
  }
  if (email && value.toLowerCase() === email) {
    details.push({ field: 'password', reason: '비밀번호는 이메일과 같을 수 없습니다.' });
    return null;
  }
  return value;
};

const validateName = (value, details) => {
  if (typeof value !== 'string' || value.trim() === '') {
    details.push({ field: 'name', reason: '이름을 입력해주세요.' });
    return null;
  }
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if ([...name].length > NAME_MAX_LENGTH) {
    details.push({ field: 'name', reason: `이름은 ${NAME_MAX_LENGTH}자 이하여야 합니다.` });
    return null;
  }
  if (INVALID_NAME_CHARS.test(name)) {
    details.push({ field: 'name', reason: '이름에 사용할 수 없는 문자가 있습니다.' });
    return null;
  }
  return name;
};

// 비어 있으면(생략·null·'') 휴대폰 번호 없이 가입한다. 값이 있으면 숫자만 남겨 돌려준다.
const validatePhone = (value, details) => {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') {
    details.push({ field: 'phone', reason: '휴대폰 번호 형식이 올바르지 않습니다.' });
    return null;
  }
  const digits = value.trim().replace(/[\s-]/g, '');
  if (!MOBILE_PATTERN.test(digits)) {
    details.push({ field: 'phone', reason: '휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)' });
    return null;
  }
  return digits;
};

const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BIRTH_YEAR_MIN = 1900;

// 필수. "YYYY-MM-DD"만 받는다. 존재하는 날짜인지(2월 30일 등)와 오늘 이후가 아닌지까지 본다.
const validateBirthDate = (value, details) => {
  if (isBlank(value)) {
    details.push({ field: 'birthDate', reason: '생년월일을 입력해주세요.' });
    return null;
  }
  const match = typeof value === 'string' ? BIRTH_DATE_PATTERN.exec(value.trim()) : null;
  const [year, month, day] = match ? match.slice(1).map(Number) : [];
  // Date.UTC는 없는 날짜를 다음 달로 넘기므로 되돌려 읽어 같은지 확인한다.
  const parsed = match ? new Date(Date.UTC(year, month - 1, day)) : null;
  const exists = parsed && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  if (!exists) {
    details.push({ field: 'birthDate', reason: '생년월일 형식이 올바르지 않습니다. (예: 1990-01-31)' });
    return null;
  }
  if (year < BIRTH_YEAR_MIN || parsed.getTime() > Date.now()) {
    details.push({ field: 'birthDate', reason: '생년월일이 올바르지 않습니다.' });
    return null;
  }
  return value.trim();
};

const validateAgreement =(value, field, label, details) => {
  if (value !== true) details.push({ field, reason: `${label}에 동의해야 가입할 수 있습니다.` });
};

// 통과하면 정규화된 값을 돌려준다. body 형식 오류·값 오류는 400, 역할 정책은 role별 에러로 던진다.
export const parseRegisterBody = (body) => {
  assertAllowedBody(body, REGISTER_FIELDS);

  const details = [];
  const email = validateEmail(body.email, details);
  const password = validatePassword(body.password, email, details);
  const name = validateName(body.name, details);
  const phone = validatePhone(body.phone, details);
  const birthDate = validateBirthDate(body.birthDate, details);
  validateAgreement(body.termsAgreed, 'termsAgreed', '이용약관', details);
  validateAgreement(body.privacyAgreed, 'privacyAgreed', '개인정보 수집·이용', details);

  const { role } = body;
  if (typeof role !== 'string' || !['LANDLORD', 'TENANT', 'ADMIN'].includes(role)) {
    details.push({ field: 'role', reason: 'LANDLORD, TENANT 중 하나여야 합니다.' });
  }
  if (body.invitationToken !== undefined && body.invitationToken !== null && typeof body.invitationToken !== 'string') {
    details.push({ field: 'invitationToken', reason: '문자열이어야 합니다.' });
  }
  throwIfInvalid(details);

  // 형식이 맞는 요청에 대해서만 정책 위반을 알린다. ADMIN은 가입으로 만들 수 없다(운영자 계정은 내부 발급).
  if (role === 'ADMIN') {
    throw new AppError('ROLE_NOT_ALLOWED', 403, '해당 역할로는 가입할 수 없습니다.');
  }
  // 임차인은 임대인이 보낸 초대 링크로만 가입한다. 초대(계약) 도메인이 생기기 전까지는 어떤 토큰도 받지 않는다.
  if (role === 'TENANT' || !isBlank(body.invitationToken)) {
    throw new AppError(
      'TENANT_INVITATION_UNAVAILABLE',
      422,
      '임차인 가입은 임대인이 보낸 초대 링크로만 할 수 있으며, 아직 지원 준비 중입니다.',
    );
  }

  return { email, password, name, phone, birthDate, role };
};

// 소셜 가입 마무리(POST /auth/oauth/signup) 입력. 이메일은 제공자가 준 값을 쓰므로 받지 않는다.
// 이름은 제공자가 준 값이 기본이고, 보내면 그 값으로 바꾼다. role은 LANDLORD로 고정이다(임차인은 초대 가입).
export const OAUTH_SIGNUP_FIELDS = ['name', 'phone', 'birthDate', 'termsAgreed', 'privacyAgreed'];

export const parseOAuthSignupBody = (body, defaultName) => {
  assertAllowedBody(body, OAUTH_SIGNUP_FIELDS);

  const details = [];
  const name = validateName(isBlank(body.name) ? defaultName : body.name, details);
  const phone = validatePhone(body.phone, details);
  const birthDate = validateBirthDate(body.birthDate, details);
  validateAgreement(body.termsAgreed, 'termsAgreed', '이용약관', details);
  validateAgreement(body.privacyAgreed, 'privacyAgreed', '개인정보 수집·이용', details);
  throwIfInvalid(details);

  return { name, phone, birthDate, role: 'LANDLORD' };
};
