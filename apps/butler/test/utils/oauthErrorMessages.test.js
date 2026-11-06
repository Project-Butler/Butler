import { describe, expect, it } from 'vitest';
import { getOAuthErrorMessage } from '../../src/utils/oauthErrorMessages';

describe('getOAuthErrorMessage', () => {
  it('API가 보내는 코드마다 사람이 읽을 문구를 준다', () => {
    const codes = [
      'OAUTH_DENIED',
      'OAUTH_STATE_INVALID',
      'OAUTH_EMAIL_REQUIRED',
      'OAUTH_EMAIL_NOT_VERIFIED',
      'OAUTH_EMAIL_IN_USE',
      'OAUTH_ROLE_NOT_ALLOWED',
      'OAUTH_ACCOUNT_CONFLICT',
      'OAUTH_PROVIDER_ERROR',
      'OAUTH_UNAVAILABLE',
      'RATE_LIMITED',
      'AUTH_ACCOUNT_SUSPENDED',
      'AUTH_ACCOUNT_UNAVAILABLE',
    ];
    const fallback = getOAuthErrorMessage('UNKNOWN');
    for (const code of codes) {
      const message = getOAuthErrorMessage(code);
      expect(message).toMatch(/[가-힣]/);
      expect(message, code).not.toBe(fallback);
    }
  });

  it('모르는 코드나 빈 값은 기본 문구를 쓰고 코드 문자열을 그대로 보여 주지 않는다', () => {
    for (const code of ['SOMETHING_NEW', '', null, undefined, '__proto__']) {
      const message = getOAuthErrorMessage(code);
      expect(message).toBe('소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  });
});
