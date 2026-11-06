// 임대인 앱 화면 (docs/plan.md 3장): 앱 셸 안에서 앱 화면이 아직 없는 주소는 "준비 중"을 보여 준다.
// 하단 탭 4칸(Figma IA 기준 임시): 홈 /landlord/home · 내 자산 /landlord/buildings · 커뮤니티 /landlord/community · 내 정보 /landlord/settings
// 표가 많은 웹 화면을 모바일에 그대로 보여 주지 않는다.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LandlordAppRoutes } from '../../src/landlord/app/LandlordAppRoutes';

const USER = { id: 'l-1', name: '김집주', email: 'landlord@butler.test', role: 'LANDLORD' };

const LocationProbe = () => {
  const { pathname } = useLocation();
  return <output data-testid="location">{pathname}</output>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (path, { onLogout = vi.fn() } = {}) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={onLogout} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onLogout };
};

const activeTabs = () => screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page').map((button) => button.textContent);

describe('임대인 앱: 하단 탭', () => {
  it('앱 셸(data-shell="landlord-app")과 탭 4칸이 그려진다', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/landlord/home']}>
        <Routes>
          <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-shell="landlord-app"]')).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: '하단 메뉴' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['홈', '내 자산', '커뮤니티', '내 정보']);
  });

  it.each([
    ['/landlord/home', '홈'],
    ['/landlord/buildings', '내 자산'],
    ['/landlord/community', '커뮤니티'],
    ['/landlord/community/briefing', '커뮤니티'],
    ['/landlord/community/posts/p-1', '커뮤니티'],
    ['/landlord/settings', '내 정보'],
  ])('%s 에서는 [%s] 탭이 활성이다', (path, label) => {
    renderAt(path);
    expect(activeTabs()).toEqual([label]);
  });

  it.each([
    ['/landlord/contracts', '탭에 없는 주소'],
    ['/landlord/homeless', '접두어로 시작만 하는 주소'],
    ['/landlord/communityx', '접두어로 시작만 하는 주소'],
    ['/landlord/no-such-page', '없는 주소'],
  ])('%s (%s)는 어느 탭도 활성이 아니다', (path) => {
    renderAt(path);
    expect(activeTabs()).toEqual([]);
  });

  it.each([
    ['홈', '/landlord/home'],
    ['내 자산', '/landlord/buildings'],
    ['커뮤니티', '/landlord/community'],
    ['내 정보', '/landlord/settings'],
  ])('[%s] 탭을 누르면 %s 로 이동하고 그 탭이 활성이 된다', async (label, expectedPath) => {
    renderAt(label === '홈' ? '/landlord/settings' : '/landlord/home');
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(where()).toBe(expectedPath);
    expect(activeTabs()).toEqual([label]);
  });

  it('탭을 차례로 눌러도 활성 표시가 하나만 남고 따라 움직인다', async () => {
    renderAt('/landlord/home');
    for (const label of ['내 자산', '커뮤니티', '내 정보', '홈']) {
      await userEvent.click(screen.getByRole('button', { name: label }));
      expect(activeTabs(), `[${label}] 을 누른 뒤`).toEqual([label]);
    }
  });
});

describe('임대인 앱: 준비 중 화면', () => {
  it.each([
    '/landlord/home',
    '/landlord/buildings',
    '/landlord/community',
    '/landlord/community/briefing',
    '/landlord/settings',
    '/landlord/contracts',
    '/landlord/contracts/c-1/edit',
    '/landlord/no-such-page',
  ])('%s 은 앱 셸 안에서 "준비 중"을 보여 준다 (웹 화면을 그대로 보여 주지 않는다)', (path) => {
    renderAt(path);
    expect(within(screen.getByRole('main')).getByRole('region', { name: '준비 중' })).toBeInTheDocument();
    // 웹 셸(사이드바)의 표지가 없다
    expect(screen.queryByText('버틀러의 자산')).not.toBeInTheDocument();
  });

  it('탭 화면은 그 이름을 제목으로 보여 준다', () => {
    renderAt('/landlord/buildings');
    expect(within(screen.getByRole('region', { name: '준비 중' })).getByRole('heading', { name: '내 자산' })).toBeInTheDocument();
  });

  it('/landlord 로 들어오면 /landlord/home 으로 간다', () => {
    renderAt('/landlord');
    expect(where()).toBe('/landlord/home');
    expect(activeTabs()).toEqual(['홈']);
  });
});

describe('임대인 앱: 내 정보 (준비 중 + 로그아웃)', () => {
  it('내 정보 탭에는 계정 정보와 [로그아웃]이 있고, 누르면 onLogout 이 불린다', async () => {
    const { onLogout } = renderAt('/landlord/settings');
    const main = within(screen.getByRole('main'));
    expect(main.getByText('김집주')).toBeInTheDocument();
    expect(main.getByText('landlord@butler.test')).toBeInTheDocument();
    await userEvent.click(main.getByRole('button', { name: '로그아웃' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it.each(['/landlord/home', '/landlord/buildings', '/landlord/community'])('%s 에는 로그아웃 버튼이 없다 (한 곳에만 둔다)', (path) => {
    renderAt(path);
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('상단 바의 아바타(내 계정)를 누르면 내 정보로 간다. 하단 탭 이름과 겹치지 않는다', async () => {
    renderAt('/landlord/home');
    const avatar = within(screen.getByRole('banner')).getByRole('button', { name: '내 계정' });
    expect(avatar).toHaveTextContent('김');
    await userEvent.click(avatar);
    expect(where()).toBe('/landlord/settings');
  });
});
