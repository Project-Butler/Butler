// 관리자 화면 주소는 앱 안에서 /admin 아래에 놓인다. 경로 표는 접두어 없는 상대 경로이고
// buildLocation 이 접두어를 붙이고 resolveViewKey 가 뗀다.
import { generatePath } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BASE_PATH, buildLocation, HOME_PATH, resolveViewKey, ROUTE_TABLE } from '../../src/admin/routes';

describe('관리자 routes', () => {
  it('접두어와 홈', () => {
    expect(BASE_PATH).toBe('/admin');
    expect(HOME_PATH).toBe('/admin/dashboard');
  });

  it('buildLocation 은 /admin 을 붙인다', () => {
    expect(buildLocation('dashboard').pathname).toBe('/admin/dashboard');
    expect(buildLocation('users').pathname).toBe('/admin/users');
    expect(buildLocation('userDetail', { userId: 'u-1' }).pathname).toBe('/admin/users/u-1');
    expect(buildLocation('contractDetail', { contractId: 'c-1' }).pathname).toBe('/admin/contracts/c-1');
    expect(buildLocation('verificationAttempts').pathname).toBe('/admin/ownership-verification-attempts');
  });

  it('쿼리 문자열을 그대로 넘긴다', () => {
    expect(buildLocation('users', undefined, '?page=2')).toEqual({ pathname: '/admin/users', search: '?page=2' });
  });

  it('모르는 key 는 관리자 홈으로 보낸다', () => {
    expect(buildLocation('no-such-key').pathname).toBe('/admin/dashboard');
  });

  it('resolveViewKey 는 /admin 을 떼고 찾는다. 하위 화면은 메뉴 key(navKey)를 켠다', () => {
    expect(resolveViewKey('/admin/dashboard')).toBe('dashboard');
    expect(resolveViewKey('/admin/users')).toBe('users');
    expect(resolveViewKey('/admin/users/u-1')).toBe('users');
    expect(resolveViewKey('/admin/contracts/c-1')).toBe('contracts');
    expect(resolveViewKey('/admin/ownership-verification-attempts')).toBe('verificationAttempts');
  });

  it('경로 표에 없는 주소와, 접두어 밖의 주소는 null (우연히 맞지 않는다)', () => {
    expect(resolveViewKey('/admin/no-such-page')).toBeNull();
    expect(resolveViewKey('/users')).toBeNull();
    expect(resolveViewKey('/dashboard')).toBeNull();
    expect(resolveViewKey('/landlord/contracts')).toBeNull();
    expect(resolveViewKey('/admin-evil/users')).toBeNull();
  });

  it('경로 표의 모든 화면이 build → resolve 왕복에서 제자리로 돌아온다', () => {
    for (const route of ROUTE_TABLE) {
      const params = Object.fromEntries([...route.path.matchAll(/:(\w+)/g)].map(([, name]) => [name, 'x']));
      const { pathname } = buildLocation(route.key, params);
      expect(pathname, route.key).toBe(`/admin${generatePath(route.path, params)}`);
      expect(resolveViewKey(pathname), route.key).toBe(route.navKey ?? route.key);
    }
  });

  it('경로 표는 접두어 없는 상대 경로다 (중첩 <Routes> 안에서 그대로 쓴다)', () => {
    for (const route of ROUTE_TABLE) expect(route.path.startsWith('/admin'), route.key).toBe(false);
  });
});
