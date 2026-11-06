// 역할 홈과 로그인 뒤 돌아갈 주소(from) 검증 (docs/plan.md 3장):
//   - 로그인 뒤 돌아갈 주소(from)는 내 역할 접두어로 시작할 때만 쓰고, 아니면 역할 홈으로 보낸다.
//   - 다른 역할 주소로 들어오면 내 역할 홈으로 보낸다.
import { describe, expect, it } from 'vitest';
import { getRoleHome, isKnownRole, resolveAfterLogin, ROLE_PREFIX } from '../../src/auth/roleHome';
import { HOME_PATH as ADMIN_HOME } from '../../src/admin/routes';
import { HOME_PATH as LANDLORD_HOME } from '../../src/landlord/web/routes';

describe('역할 홈', () => {
  it('역할별 홈 주소', () => {
    expect(getRoleHome('ADMIN')).toBe('/admin/dashboard');
    expect(getRoleHome('LANDLORD')).toBe('/landlord/home');
    expect(getRoleHome('TENANT')).toBe('/tenant/home');
  });

  it('각 역할 폴더의 HOME_PATH 와 어긋나지 않는다 (둘이 따로 있으므로 같이 움직여야 한다)', () => {
    expect(getRoleHome('ADMIN')).toBe(ADMIN_HOME);
    expect(getRoleHome('LANDLORD')).toBe(LANDLORD_HOME);
  });

  it('알 수 없는 역할은 홈이 없다 (로그인 화면으로 보내면 무한 반복되므로 null)', () => {
    expect(getRoleHome('SUPERUSER')).toBeNull();
    expect(getRoleHome(undefined)).toBeNull();
    expect(isKnownRole('SUPERUSER')).toBe(false);
    expect(isKnownRole('ADMIN')).toBe(true);
  });

  it('접두어', () => {
    expect(ROLE_PREFIX).toEqual({ ADMIN: '/admin', LANDLORD: '/landlord', TENANT: '/tenant' });
  });
});

describe('resolveAfterLogin: from 은 내 역할 접두어일 때만', () => {
  it.each([
    ['내 역할 하위 주소', '/landlord/contracts/c-1', 'LANDLORD', '/landlord/contracts/c-1'],
    ['쿼리가 붙은 내 역할 주소', '/landlord/contracts?status=EXPIRING_SOON', 'LANDLORD', '/landlord/contracts?status=EXPIRING_SOON'],
    ['관리자의 관리자 주소', '/admin/users', 'ADMIN', '/admin/users'],
    ['임차인의 임차인 주소', '/tenant/home', 'TENANT', '/tenant/home'],
    ['접두어 자체', '/landlord', 'LANDLORD', '/landlord'],
  ])('%s → 그대로 쓴다', (_name, from, role, expected) => {
    expect(resolveAfterLogin(from, role)).toBe(expected);
  });

  it.each([
    ['T4: 관리자 주소로 가려던 사람이 임대인으로 로그인', '/admin/users', 'LANDLORD', '/landlord/home'],
    ['임대인 주소로 가려던 사람이 관리자로 로그인', '/landlord/contracts', 'ADMIN', '/admin/dashboard'],
    ['임차인이 임대인 주소', '/landlord/home', 'TENANT', '/tenant/home'],
    ['로그인 화면 자신', '/login', 'LANDLORD', '/landlord/home'],
    ['루트', '/', 'ADMIN', '/admin/dashboard'],
    ['접두어로 시작만 하는 다른 경로', '/landlord-evil/x', 'LANDLORD', '/landlord/home'],
    ['접두어 뒤에 글자가 붙은 경로', '/landlords', 'LANDLORD', '/landlord/home'],
  ])('%s → 역할 홈', (_name, from, role, expected) => {
    expect(resolveAfterLogin(from, role)).toBe(expected);
  });

  it.each([
    ['절대 주소', 'https://evil.example/landlord/home'],
    ['프로토콜 상대 주소', '//evil.example/landlord/home'],
    ['역슬래시로 우회', '/\\evil.example'],
    ['상위 경로 이동 조각', '/landlord/../admin/users'],
    ['인코딩된 상위 경로 조각', '/landlord/%2e%2e/admin/users'],
    ['빈 문자열', ''],
    ['undefined', undefined],
    ['null', null],
    ['문자열이 아닌 값', { pathname: '/landlord/home' }],
  ])('안전하지 않은 from(%s) → 역할 홈', (_name, from) => {
    expect(resolveAfterLogin(from, 'LANDLORD')).toBe('/landlord/home');
  });

  it('알 수 없는 역할은 null (호출부가 별도 화면으로 처리)', () => {
    expect(resolveAfterLogin('/landlord/home', 'SUPERUSER')).toBeNull();
  });
});
