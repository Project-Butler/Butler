// 임대인 화면 주소는 앱 안에서 /landlord 아래에 놓인다. (기존 contract·ownershipVerification 테스트는 개별 key를 본다.)
import { generatePath } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BASE_PATH, buildLocation, COMMUNITY_PATH, HOME_PATH, resolveViewKey, ROUTE_TABLE } from '../../src/landlord/web/routes';

describe('임대인 routes', () => {
  it('접두어·홈·커뮤니티 경로', () => {
    expect(BASE_PATH).toBe('/landlord');
    expect(HOME_PATH).toBe('/landlord/home');
    expect(COMMUNITY_PATH).toBe('/landlord/community');
  });

  it('화면이 아직 없는 메뉴 key 도 /landlord 아래로 간다', () => {
    expect(buildLocation('settings').pathname).toBe('/landlord/settings');
    expect(buildLocation('tickets').pathname).toBe('/landlord/tickets');
    expect(buildLocation('documents').pathname).toBe('/landlord/documents');
    expect(buildLocation('community').pathname).toBe('/landlord/community');
  });

  it('state(안내 문구)와 쿼리는 접두어를 붙여도 그대로 남는다', () => {
    expect(buildLocation('buildingList', { notice: '등록됨' })).toEqual({ pathname: '/landlord/buildings', state: { notice: '등록됨' } });
    expect(buildLocation('properties', { relation: 'FORMER_OWNER' })).toEqual({ pathname: '/landlord/properties', search: '?relation=FORMER_OWNER' });
  });

  it('resolveViewKey: 접두어 없는 첫 구간을 key로 쓰는 규칙(화면이 없는 메뉴)은 그대로다', () => {
    expect(resolveViewKey('/landlord')).toBe('home');
    expect(resolveViewKey('/landlord/home')).toBe('home');
    expect(resolveViewKey('/landlord/community/briefing')).toBe('community');
    expect(resolveViewKey('/landlord/settings')).toBe('settings');
  });

  it('접두어 밖의 주소는 null (우연히 맞지 않는다)', () => {
    expect(resolveViewKey('/contracts')).toBeNull();
    expect(resolveViewKey('/home')).toBeNull();
    expect(resolveViewKey('/admin/contracts')).toBeNull();
    expect(resolveViewKey('/landlord-evil/contracts')).toBeNull();
    expect(resolveViewKey('/landlords')).toBeNull();
  });

  it('경로 표의 모든 화면이 build → resolve 왕복에서 제자리로 돌아온다', () => {
    for (const route of ROUTE_TABLE) {
      const params = Object.fromEntries([...route.path.matchAll(/:(\w+)/g)].map(([, name]) => [name, 'x']));
      const { pathname } = buildLocation(route.key, params);
      expect(pathname, route.key).toBe(`/landlord${generatePath(route.path, params)}`);
      expect(resolveViewKey(pathname), route.key).toBe(route.key);
    }
  });

  it('경로 표는 접두어 없는 상대 경로다 (중첩 <Routes> 안에서 그대로 쓴다)', () => {
    for (const route of ROUTE_TABLE) expect(route.path.startsWith('/landlord'), route.key).toBe(false);
  });
});
