// 공개 초대 화면 분기(개발 계획 3-2 상태 표)와 본인 확인 입력·오류 처리.
import { describe, expect, it } from 'vitest';
import {
  CHECK_SESSION,
  decideAfterContract,
  decideInitialScreen,
  decideVerifyError,
  formatPhoneMask,
  formatWait,
  getRetryAfterSeconds,
  sanitizeLast4,
  SCREEN,
  screenForError,
  toInviteErrorKind,
  VERIFY_FAILED_MESSAGE,
  WAIT_MESSAGE,
} from '../../src/invite/inviteState';

const apiError = (status, code, details = []) => ({ status, code, message: `${code} 문구`, details });

describe('decideInitialScreen: 로그인 상태별 첫 화면', () => {
  it.each([
    ['비로그인 + 쓸 수 있는 초대 → B1', { role: null, previewKind: 'OK' }, SCREEN.SUMMARY],
    ['TENANT + 쓸 수 있는 초대 → 확인 세션 확인 단계', { role: 'TENANT', previewKind: 'OK' }, CHECK_SESSION],
    ['LANDLORD → F3', { role: 'LANDLORD', previewKind: 'OK' }, SCREEN.WRONG_ROLE],
    ['ADMIN → F3', { role: 'ADMIN', previewKind: 'OK' }, SCREEN.WRONG_ROLE],
    ['LANDLORD 는 초대가 쓸 수 없어도 F3', { role: 'LANDLORD', previewKind: 'UNUSABLE' }, SCREEN.WRONG_ROLE],
    ['쓸 수 없는 초대(404·422) → F1', { role: null, previewKind: 'UNUSABLE' }, SCREEN.UNUSABLE],
    ['TENANT + 쓸 수 없는 초대 → F1', { role: 'TENANT', previewKind: 'UNUSABLE' }, SCREEN.UNUSABLE],
    ['비로그인 + 이미 수락 → 이미 추가된 링크', { role: null, previewKind: 'ALREADY_ACCEPTED' }, SCREEN.ACCEPTED_LINK],
    ['TENANT + 이미 수락 → F2', { role: 'TENANT', previewKind: 'ALREADY_ACCEPTED' }, SCREEN.ALREADY_ADDED],
    ['가입하고 돌아온 TENANT + 이미 수락 → C3', { role: 'TENANT', previewKind: 'ALREADY_ACCEPTED', joined: true }, SCREEN.ADDED],
    ['joined 표지가 있어도 아직 수락 전이면 보통 흐름', { role: 'TENANT', previewKind: 'OK', joined: true }, CHECK_SESSION],
    ['joined 표지만으로 로그인 전 사람에게 C3 를 보이지 않는다', { role: null, previewKind: 'ALREADY_ACCEPTED', joined: true }, SCREEN.ACCEPTED_LINK],
    ['일시 오류 → 다시 시도 화면', { role: null, previewKind: 'ERROR' }, SCREEN.ERROR],
    ['IP 한도 → 다시 시도 화면', { role: null, previewKind: 'RATE_LIMITED' }, SCREEN.ERROR],
  ])('%s', (_name, input, expected) => {
    expect(decideInitialScreen(input)).toBe(expected);
  });
});

describe('decideAfterContract: 계약서 응답(확인 세션) 뒤', () => {
  it.each([
    ['TENANT + 확인 세션 있음 → C2', 'TENANT', 'OK', SCREEN.CONFIRM],
    ['비로그인 + 확인 세션 있음 → B3', null, 'OK', SCREEN.CONTRACT],
    ['확인 세션 없음 → B1 부터', 'TENANT', 'VERIFY_REQUIRED', SCREEN.SUMMARY],
    ['이미 이 계약에 연결 → F2', 'TENANT', 'ALREADY_ACCEPTED', SCREEN.ALREADY_ADDED],
    ['그 사이 만료 → F1', null, 'UNUSABLE', SCREEN.UNUSABLE],
  ])('%s', (_name, role, contractKind, expected) => {
    expect(decideAfterContract({ role, contractKind })).toBe(expected);
  });
});

describe('오류 → 종류 · 화면', () => {
  it.each([
    [apiError(404, 'INVITATION_INVALID'), 'UNUSABLE'],
    [apiError(422, 'INVITATION_EXPIRED'), 'UNUSABLE'],
    [apiError(409, 'INVITATION_ALREADY_ACCEPTED'), 'ALREADY_ACCEPTED'],
    [apiError(409, 'CONTRACT_TENANT_ALREADY_LINKED'), 'LINKED_OTHER'],
    [apiError(403, 'INVITATION_VERIFY_REQUIRED'), 'VERIFY_REQUIRED'],
    [apiError(422, 'INVITATION_VERIFY_FAILED'), 'VERIFY_FAILED'],
    [apiError(429, 'INVITATION_VERIFY_RATE_LIMITED'), 'RATE_LIMITED'],
    [apiError(429, 'RATE_LIMITED'), 'RATE_LIMITED'],
    [apiError(429, 'INVITATION_VERIFY_DAILY_LIMIT'), 'DAILY_LIMIT'],
    [apiError(403, 'FORBIDDEN_ROLE'), 'WRONG_ROLE'],
    [apiError(500, 'INTERNAL_ERROR'), 'ERROR'],
    [apiError(null, null), 'ERROR'],
    [apiError(400, '__proto__'), 'ERROR'],
    [null, 'ERROR'],
  ])('%o → %s', (error, kind) => {
    expect(toInviteErrorKind(error)).toBe(kind);
  });

  it('수락 실패 화면', () => {
    expect(screenForError('ALREADY_ACCEPTED', 'TENANT')).toBe(SCREEN.ALREADY_ADDED);
    expect(screenForError('LINKED_OTHER', 'TENANT')).toBe(SCREEN.LINKED_OTHER);
    expect(screenForError('WRONG_ROLE', 'TENANT')).toBe(SCREEN.WRONG_ROLE);
    expect(screenForError('VERIFY_REQUIRED', 'TENANT')).toBe(SCREEN.VERIFY);
    expect(screenForError('ERROR', 'TENANT')).toBeNull();
  });
});

describe('decideVerifyError: 본인 확인 실패', () => {
  it('422 번호 불일치 → B2 에 "번호가 맞지 않아요"', () => {
    expect(decideVerifyError(apiError(422, 'INVITATION_VERIFY_FAILED'), null)).toEqual({ message: VERIFY_FAILED_MESSAGE });
    expect(VERIFY_FAILED_MESSAGE).toContain('번호가 맞지 않아요');
  });

  it('429 단계 대기 → "잠시 후 다시 시도해 주세요" + 남은 초', () => {
    const error = apiError(429, 'INVITATION_VERIFY_RATE_LIMITED', [{ field: 'retryAfterSeconds', reason: 'WAIT', retryAfterSeconds: 30 }]);
    expect(decideVerifyError(error, null)).toEqual({ message: WAIT_MESSAGE, waitSeconds: 30 });
  });

  it('429 하루 한도 → B2b 화면(횟수 없음)', () => {
    expect(decideVerifyError(apiError(429, 'INVITATION_VERIFY_DAILY_LIMIT', [{ retryAfterSeconds: 80000 }]), null)).toEqual({ screen: SCREEN.DAILY_LIMIT });
  });

  it('쓸 수 없는 초대 → F1', () => {
    expect(decideVerifyError(apiError(422, 'INVITATION_EXPIRED'), null)).toEqual({ screen: SCREEN.UNUSABLE });
  });

  it('그 밖의 오류는 서버 문구', () => {
    expect(decideVerifyError(apiError(500, 'INTERNAL_ERROR'), null)).toEqual({ message: 'INTERNAL_ERROR 문구' });
  });
});

describe('대기 시간', () => {
  it('details 의 retryAfterSeconds 를 올림해서 쓴다', () => {
    expect(getRetryAfterSeconds(apiError(429, 'X', [{ retryAfterSeconds: 29.2 }]))).toBe(30);
    expect(getRetryAfterSeconds(apiError(429, 'X', [{ field: 'a' }]))).toBeNull();
    expect(getRetryAfterSeconds(null)).toBeNull();
  });

  it.each([
    [45, '45초'],
    [120, '2분'],
    [90, '1분 30초'],
    [0, ''],
  ])('%i초 → "%s"', (seconds, text) => {
    expect(formatWait(seconds)).toBe(text);
  });
});

describe('휴대폰 뒤 4자리', () => {
  it('숫자만, 4자리까지', () => {
    expect(sanitizeLast4('12a3-45')).toBe('1234');
    expect(sanitizeLast4('')).toBe('');
    expect(sanitizeLast4(undefined)).toBe('');
  });

  it.each([
    ['', '010-****-____'],
    ['4', '010-****-4___'],
    ['44', '010-****-44__'],
    ['5432', '010-****-5432'],
  ])('"%s" → %s (앞자리는 가린다)', (digits, mask) => {
    expect(formatPhoneMask(digits)).toBe(mask);
  });
});
