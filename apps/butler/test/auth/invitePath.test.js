import { describe, expect, it } from 'vitest';
import { getInviteTokenFromPath, inviteJoinedPath, invitePath, inviteRegisterPath } from '../../src/auth/invitePath';

describe('초대 주소', () => {
  it('주소 만들기', () => {
    expect(invitePath('abc_DEF-1')).toBe('/invite/abc_DEF-1');
    expect(inviteRegisterPath('abc')).toBe('/invite/abc/register');
    expect(inviteJoinedPath('abc')).toBe('/invite/abc?joined=1');
  });

  it.each([
    ['/invite/abc', 'abc'],
    ['/invite/abc/register', 'abc'],
    ['/invite/abc?oauth_error=X', 'abc'],
    ['/invite/abc#x', 'abc'],
    ['/invite/', null],
    ['/invite', null],
    ['/tenant/home', null],
    ['https://evil.example/invite/abc', null],
    [undefined, null],
    [{ pathname: '/invite/abc' }, null],
  ])('from %s → 토큰 %s', (from, token) => {
    expect(getInviteTokenFromPath(from)).toBe(token);
  });
});
