// 권리자 인증 판정·변환 순수 함수(DB·네트워크 의존 없음). 판정 절차는 ownershipVerification.js.
import { compareDateStrings } from './dateUtils.js';
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';

export const ACTIVE_ATTEMPT_STATUSES = Object.freeze(['PENDING', 'RUNNING']);
export const ATTEMPT_STATUSES = Object.freeze(['PENDING', 'RUNNING', 'VERIFIED', 'FAILED']);
export const VERIFICATION_REASON_CODES = Object.freeze([
  'NOT_MATCHED',
  'UNREADABLE',
  'NOT_FIRST_REGISTRANT',
  'NO_JIBUN_ADDRESS',
  'ISSUE_INVALID',
  'ISSUE_STOPPED',
  'ISSUE_FAILED',
  'OCR_FAILED',
  'TIMED_OUT',
  'OWNERSHIP_CHANGED',
  'VERIFIED_OWNER_EXISTS',
  'INTERNAL',
]);
// 러너가 돌려줄 수 있는 실패 kind. 성공은 'OK'.
export const RUNNER_FAILURE_KINDS = Object.freeze(['ISSUE_INVALID', 'ISSUE_STOPPED', 'ISSUE_FAILED', 'OCR_FAILED', 'UNREADABLE']);
export const LEDGER_KINDS = Object.freeze(['GENERAL', 'UNIT_EXCLUSIVE']);

export const STALE_ATTEMPT_MS = 10 * 60 * 1000;
export const RENEWAL_WINDOW_DAYS = 30;
export const DEFAULT_VALIDITY_YEARS = 3;
// 날짜 계산이 깨지지 않게 두는 상한.
export const MAX_VALIDITY_YEARS = 100;

const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD, 실제 있는 날짜, 오늘(KST) 이하. isValidLogDate는 미래를 허용하므로 쓰지 않는다.
export const isValidBirthDate = (value, todayKST) => {
  if (typeof value !== 'string' || !BIRTH_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return compareDateStrings(value, todayKST) <= 0;
};

// 본인 정보는 이 함수에서만 만든다. 생년월일은 지금 인증 화면에서 임시로 받는다.
// 회원 정보로 바꿀 때 절차: (1) 인증 화면의 BirthDateField와 POST의 birthDate를 뺀다.
// (2) 이 함수가 user의 생년월일을 읽게 한다. (3) birth_date_enc 칸과 finishAttempt의 삭제 줄을 뺀다.
// 회원 생년월일은 인증이 끝나도 유지된다.
export const resolveIdentity = (user, { birthDate }) => ({ name: user?.name ?? null, birthDate: birthDate ?? null });

const normalizeName = (name) => (typeof name === 'string' ? name.normalize('NFC').replace(/\s+/g, '') : '');

// 값이 정확히 일치할 때만 인증한다. 어느 쪽이든 값이 없으면 일치가 아니다.
// 일치가 없고 OCR 쪽에 비어 있는 값이 있으면(또는 소유자가 없으면) UNREADABLE.
export const matchOwner = (identity, owners) => {
  const list = Array.isArray(owners) ? owners : [];
  if (list.length === 0) return 'UNREADABLE';

  const name = normalizeName(identity?.name);
  const birthDate = identity?.birthDate ?? null;
  const isMatch = (owner) => Boolean(name) && Boolean(birthDate) && normalizeName(owner?.name) === name && owner?.birthDate === birthDate;
  if (list.some(isMatch)) return 'VERIFIED';

  return list.some((owner) => !normalizeName(owner?.name) || !owner?.birthDate) ? 'UNREADABLE' : 'NOT_MATCHED';
};

const isBefore = (a, b) => {
  const diff = a.startedAt.getTime() - b.startedAt.getTime();
  return diff !== 0 ? diff < 0 : a.id < b.id;
};

// 인증을 시작할 수 있는 순서인지. rows: 같은 호실의 활성 소유 관계 전부.
// 저장값이 VERIFIED인 본인(만료 포함)은 면제. 다른 사람 중 만료된 행은 순서에서 뺀다. REVOKED·미인증은 포함한다.
export const canStartInOrder = (rows, ownershipId, now = new Date()) => {
  const mine = rows.find((row) => row.id === ownershipId);
  if (!mine) return false;
  if (mine.verificationStatus === 'VERIFIED') return true;
  return !rows.some(
    (row) => row.id !== ownershipId && computeOwnershipVerificationStatus(row, now) !== 'EXPIRED' && isBefore(row, mine),
  );
};

export const hasEarlierRevokedOwner = (rows, mine) =>
  rows.some((row) => row.id !== mine.id && row.verificationStatus === 'REVOKED' && isBefore(row, mine));

// 단지의 지번 주소 조립. jibunAddress 뒤에 건물명이 붙는 경우가 있어(…신천동 17 잠실파크리오)
// 지번 칸으로 만든 토큰을 공백 단위로 찾아 그 앞까지만 쓴다(부분 문자열로 찾지 않는다). 조립할 수 없으면 null.
export const buildJibunAddress = (complex) => {
  const { jibunAddress, isMountain, mainLot, subLot } = complex ?? {};
  if (typeof jibunAddress !== 'string' || !Number.isInteger(mainLot) || mainLot <= 0) return null;

  const lot = subLot ? `${mainLot}-${subLot}` : `${mainLot}`;
  const words = jibunAddress.trim().split(/\s+/);
  const isLot = (word) => word === lot || word === `${lot}번지`;
  const index = words.findIndex((word, i) => {
    if (isMountain) return (word.startsWith('산') && isLot(word.slice(1))) || (words[i - 1] === '산' && isLot(word));
    return isLot(word);
  });
  if (index < 0) return null;

  const before = words.slice(0, index);
  if (before[before.length - 1] === '산') {
    // 산 표기인데 칸은 산이 아니면 어느 필지인지 확실하지 않으므로 조립하지 않는다.
    if (!isMountain) return null;
    before.pop();
  }
  if (before.length < 2) return null;
  return `${before.join(' ')} ${isMountain ? '산 ' : ''}${lot}`;
};

// 호실 → 러너에 넘길 대상. 생년월일과 사용자 이름은 넣지 않는다. 주소를 만들 수 없으면 null.
export const buildLedgerTarget = (property) => {
  const address = buildJibunAddress(property.complex);
  if (!address) return null;
  return {
    address,
    dong: property.buildingNo,
    ho: property.unitNo,
    buildingName: property.complex.buildingName ?? property.complex.name ?? null,
  };
};

const ISSUE_STATUS_KINDS = { invalid: 'ISSUE_INVALID', stopped: 'ISSUE_STOPPED', error: 'ISSUE_FAILED' };

// issueLedger·extractOwners 결과 → { kind, ledgerKind, owners:[{ name, birthDate }] }. 원문(idText, warnings, reason)은 버린다.
export const toRunnerResult = ({ issued, extracted = null, ocrFailed = false }) => {
  const ledgerKind = issued?.target?.ledgerKind ?? null;
  if (issued?.status !== 'ok') return { kind: ISSUE_STATUS_KINDS[issued?.status] ?? 'ISSUE_FAILED', ledgerKind, owners: [] };
  if (ocrFailed) return { kind: 'OCR_FAILED', ledgerKind, owners: [] };

  const owners = (extracted?.owners ?? []).map(({ name, birthDate }) => ({ name: name || null, birthDate: birthDate ?? null }));
  return { kind: owners.length > 0 ? 'OK' : 'UNREADABLE', ledgerKind, owners };
};

const MAX_RUNNER_OWNERS = 10;
const MAX_OWNER_NAME_LENGTH = 100;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 실행 서버가 보낸 결과 검사. 모양이 틀리면 null(값을 오류에 담지 않는다). 허용한 칸만 돌려준다.
export const parseRunnerResult = (body) => {
  if (!isPlainObject(body)) return null;
  const { kind, ledgerKind = null, owners = [] } = body;
  if (kind !== 'OK' && !RUNNER_FAILURE_KINDS.includes(kind)) return null;
  if (ledgerKind !== null && !LEDGER_KINDS.includes(ledgerKind)) return null;
  if (!Array.isArray(owners) || owners.length > MAX_RUNNER_OWNERS) return null;

  const parsed = [];
  for (const owner of owners) {
    if (!isPlainObject(owner) || Object.keys(owner).some((key) => key !== 'name' && key !== 'birthDate')) return null;
    const { name = null, birthDate = null } = owner;
    if (name !== null && (typeof name !== 'string' || name.length > MAX_OWNER_NAME_LENGTH)) return null;
    if (birthDate !== null && (typeof birthDate !== 'string' || !BIRTH_DATE_PATTERN.test(birthDate))) return null;
    parsed.push({ name, birthDate });
  }
  return { kind, ledgerKind, owners: parsed };
};

// 저장값(문자열)·입력값(숫자) 공용. 1 이상 정수가 아니면 null.
export const parseValidityYears = (value) => {
  const years = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(years) && years >= 1 && years <= MAX_VALIDITY_YEARS ? years : null;
};

export const computeVerificationExpiry = (now, years) => {
  const expiresAt = new Date(now.getTime());
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + years);
  return expiresAt;
};
