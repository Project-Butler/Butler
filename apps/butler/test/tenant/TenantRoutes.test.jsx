// 임차인 앱 틀 (docs/plan.md 2장·3장): 항상 앱 화면(PC 에서는 가운데 모바일 폭). 이번에는 틀(홈 자리, 내 정보 자리 + 로그아웃)만.
// 하단 탭은 홈 · 내 정보 두 칸이다. 임차인의 실제 기능 화면은 초대 기능 이후.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TenantRoutes } from '../../src/tenant/TenantRoutes';
import { BASE_PATH, HOME_PATH } from '../../src/tenant/routes';

const USER = { id: 't-1', name: '이세입', email: 'tenant@butler.test', role: 'TENANT' };

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const where = () => screen.getByTestId('location').textContent;

const renderAt = (path, { onLogout = vi.fn() } = {}) => {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tenant/*" element={<TenantRoutes user={USER} onLogout={onLogout} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { ...view, onLogout };
};
const activeTabs = () => screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page').map((button) => button.textContent);

describe('임차인 routes 상수', () => {
  it('접두어와 홈', () => {
    expect(BASE_PATH).toBe('/tenant');
    expect(HOME_PATH).toBe('/tenant/home');
  });
});

describe('임차인 앱 틀', () => {
  it('앱 셸(data-shell="tenant")에 탭 2칸(홈 · 내 정보)이 그려진다', () => {
    const { container } = renderAt('/tenant/home');
    expect(container.querySelector('[data-shell="tenant"]')).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: '하단 메뉴' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['홈', '내 정보']);
  });

  it.each([
    ['/tenant/home', '홈'],
    ['/tenant/settings', '내 정보'],
  ])('%s 에서는 [%s] 탭이 활성이다', (path, label) => {
    renderAt(path);
    expect(activeTabs()).toEqual([label]);
  });

  it.each(['/tenant/homeless', '/tenant/settingsx', '/tenant/no-such-page'])('%s 는 어느 탭도 활성이 아니다', (path) => {
    renderAt(path);
    expect(activeTabs()).toEqual([]);
  });

  it.each([
    ['홈', '/tenant/home'],
    ['내 정보', '/tenant/settings'],
  ])('[%s] 탭을 누르면 %s 로 이동하고 그 탭이 활성이 된다', async (label, expectedPath) => {
    renderAt(label === '홈' ? '/tenant/settings' : '/tenant/home');
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(where()).toBe(expectedPath);
    expect(activeTabs()).toEqual([label]);
  });

  it('/tenant 로 들어오면 /tenant/home 으로 간다', () => {
    renderAt('/tenant');
    expect(where()).toBe('/tenant/home');
    expect(activeTabs()).toEqual(['홈']);
  });
});

describe('임차인 앱: 홈 자리 · 내 정보 자리', () => {
  it.each(['/tenant/home', '/tenant/settings', '/tenant/no-such-page'])('%s 은 앱 셸 안의 "준비 중"이다', (path) => {
    renderAt(path);
    expect(within(screen.getByRole('main')).getByRole('region', { name: '준비 중' })).toBeInTheDocument();
  });

  it('홈 자리는 [홈] 제목이고 로그아웃 버튼이 없다', () => {
    renderAt('/tenant/home');
    expect(within(screen.getByRole('region', { name: '준비 중' })).getByRole('heading', { name: '홈' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('내 정보 자리에는 계정 정보와 [로그아웃]이 있고, 누르면 onLogout 이 불린다', async () => {
    const { onLogout } = renderAt('/tenant/settings');
    const main = within(screen.getByRole('main'));
    expect(main.getByText('이세입')).toBeInTheDocument();
    expect(main.getByText('tenant@butler.test')).toBeInTheDocument();
    await userEvent.click(main.getByRole('button', { name: '로그아웃' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('상단 바의 아바타(내 계정)를 누르면 내 정보로 간다', async () => {
    renderAt('/tenant/home');
    const avatar = within(screen.getByRole('banner')).getByRole('button', { name: '내 계정' });
    expect(avatar).toHaveTextContent('이');
    await userEvent.click(avatar);
    expect(where()).toBe('/tenant/settings');
  });
});
