// 앱 셸(상단 바 + 하단 탭). Figma TabBar/Mobile(탭 4칸: 홈 · 내 자산 · 커뮤니티 · 내 정보) · TopBar 를 따른다.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileShell } from '@butler/ui';

const tabs = (activeKey, onClick = () => {}) => [
  { key: 'home', label: '홈', icon: 'home', active: activeKey === 'home', onClick: () => onClick('home') },
  { key: 'assets', label: '내 자산', icon: 'building', active: activeKey === 'assets', onClick: () => onClick('assets') },
  { key: 'community', label: '커뮤니티', icon: 'users', active: activeKey === 'community', onClick: () => onClick('community') },
  { key: 'me', label: '내 정보', icon: 'user', active: activeKey === 'me', onClick: () => onClick('me') },
];

const renderShell = ({ active = 'home', onTab, avatar, children = <p>본문</p> } = {}) =>
  render(
    <MobileShell shell="test-shell" topBar={{ avatar }} tabs={tabs(active, onTab)}>
      {children}
    </MobileShell>,
  );

describe('MobileShell', () => {
  it('셸을 구분하는 표지(data-shell)가 있다', () => {
    const { container } = renderShell();
    expect(container.firstChild).toHaveAttribute('data-shell', 'test-shell');
  });

  it('상단 바에 브랜드, 아래에 탭, 가운데에 본문을 그린다', () => {
    renderShell();
    expect(within(screen.getByRole('banner')).getByText('Butler')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('본문')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '하단 메뉴' })).toBeInTheDocument();
  });

  it('탭은 홈 · 내 자산 · 커뮤니티 · 내 정보 순서로 4칸이다', () => {
    renderShell();
    const labels = within(screen.getByRole('navigation', { name: '하단 메뉴' })).getAllByRole('button').map((button) => button.textContent);
    expect(labels).toEqual(['홈', '내 자산', '커뮤니티', '내 정보']);
  });

  it.each(['home', 'assets', 'community', 'me'])('활성 탭은 %s 하나뿐이다 (aria-current)', (active) => {
    renderShell({ active });
    const current = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(tabs(active).find((tab) => tab.active).label);
  });

  it('활성 탭은 활성 아이콘, 나머지는 비활성 아이콘을 쓴다 (Figma 가 상태마다 따로 준 SVG)', () => {
    renderShell({ active: 'community' });
    const iconOf = (label) => screen.getByRole('button', { name: label }).querySelector('img').getAttribute('src');
    expect(iconOf('커뮤니티')).toMatch(/tab-users-on/);
    expect(iconOf('홈')).toMatch(/tab-home-off/);
    expect(iconOf('내 자산')).toMatch(/tab-building-off/);
    expect(iconOf('내 정보')).toMatch(/tab-user-off/);
  });

  it('활성 탭 글자는 강조색 + 굵게(tab-on), 나머지는 보조색 + 보통 굵기(tab)', () => {
    renderShell({ active: 'home' });
    const label = (name) => screen.getByRole('button', { name }).querySelector('span');
    expect(label('홈').className).toMatch(/text-accent/);
    expect(label('홈').className).toMatch(/font-semibold/);
    expect(label('내 자산').className).toMatch(/text-ink-3/);
    expect(label('내 자산').className).toMatch(/font-medium/);
  });

  it('탭을 누르면 그 탭의 onClick 이 한 번 불린다', async () => {
    const onTab = vi.fn();
    renderShell({ onTab });
    await userEvent.click(screen.getByRole('button', { name: '커뮤니티' }));
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(onTab).toHaveBeenCalledWith('community');
  });

  it('아이콘은 장식이라 글자(탭 이름)만 접근 가능한 이름이 된다', () => {
    renderShell();
    for (const image of screen.getAllByRole('button').flatMap((button) => [...button.querySelectorAll('img')])) {
      expect(image).toHaveAttribute('alt', '');
    }
    expect(screen.getByRole('button', { name: '내 자산' })).toBeInTheDocument();
  });

  it('아바타를 주면 이름의 첫 글자를 보여 주고, 누르면 onClick 이 불린다', async () => {
    const onClick = vi.fn();
    renderShell({ avatar: { name: '김집주', label: '내 정보 열기', onClick } });
    const avatar = within(screen.getByRole('banner')).getByRole('button', { name: '내 정보 열기' });
    expect(avatar).toHaveTextContent('김');
    await userEvent.click(avatar);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('아바타를 주지 않으면 상단 바에 버튼이 없다 (눌러도 아무 일 없는 버튼을 두지 않는다)', () => {
    renderShell();
    expect(within(screen.getByRole('banner')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('TopBar 말풍선(대화) 버튼', () => {
  const renderTopBar = (topBar) =>
    render(
      <MobileShell shell="test-shell" topBar={topBar} tabs={tabs('home')}>
        <p>본문</p>
      </MobileShell>,
    );

  it('message 를 주지 않으면 말풍선 버튼이 없다(지금 화면 그대로)', () => {
    renderTopBar({ notification: { count: 0, onClick: () => {} } });
    expect(screen.queryByRole('button', { name: /^대화/ })).not.toBeInTheDocument();
  });

  it('안 읽은 대화 수를 숫자로 붙이고, 99개 넘으면 99+ 로 줄인다', () => {
    const { unmount } = renderTopBar({ message: { count: 3, onClick: () => {} } });
    expect(screen.getByRole('button', { name: '대화, 안 읽은 대화 3개' })).toHaveTextContent('3');
    unmount();
    renderTopBar({ message: { count: 120, onClick: () => {} } });
    expect(screen.getByRole('button', { name: '대화, 안 읽은 대화 120개' })).toHaveTextContent('99+');
  });

  it('0이면 숫자 없이 버튼만 두고, 누르면 onClick 을 부른다', async () => {
    const onClick = vi.fn();
    renderTopBar({ message: { count: 0, onClick } });
    const button = screen.getByRole('button', { name: '대화' });
    expect(button).toHaveTextContent('');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('말풍선은 종 바로 왼쪽에 있다', () => {
    renderTopBar({ message: { count: 0, onClick: () => {} }, notification: { count: 0, onClick: () => {} } });
    const names = within(screen.getByRole('banner'))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names.indexOf('대화')).toBe(names.indexOf('알림') - 1);
  });
});
