// 사이드바 메뉴를 눌러 활성이 바뀌어도 글자 굵기가 같아 글자 폭이 흔들리지 않는다(활성은 색·배경으로만 구분).
// 실패 조건: 활성 메뉴만 굵기 클래스가 다름.
import { render, screen } from '@testing-library/react';
import { AppShell } from '@butler/ui';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('AppShell 사이드바 메뉴', () => {
  it('활성·비활성 메뉴의 글자 굵기가 같다', () => {
    render(
      <AppShell
        brand="Butler"
        breadcrumb={['홈']}
        user={{ name: '김집주님', role: '임대인', onLogout: () => {} }}
        nav={[
          { key: 'home', label: '홈', active: true, onClick: () => {} },
          { key: 'leases', label: '계약', active: false, onClick: () => {} },
        ]}
      >
        본문
      </AppShell>,
    );
    const weight = (name) => screen.getByRole('button', { name }).className.match(/font-(?:medium|semibold|bold)/)?.[0];
    expect(weight('홈')).toBe('font-medium');
    expect(weight('계약')).toBe(weight('홈'));
  });
});

describe('AppShell 위 막대 말풍선(대화 팝업)', () => {
  const renderShell = (messages) =>
    render(
      <AppShell brand="Butler" breadcrumb={['홈']} messages={messages} nav={[]}>
        본문
      </AppShell>,
    );

  it('messages 가 없으면 말풍선이 없다', () => {
    renderShell(undefined);
    expect(screen.queryByRole('button', { name: /^대화/ })).not.toBeInTheDocument();
  });

  it('안 읽은 대화 수를 숫자로, 열렸으면 aria-expanded, 누르면 onClick', async () => {
    const onClick = vi.fn();
    renderShell({ count: 3, onClick, expanded: true, id: 'trigger' });
    const button = screen.getByRole('button', { name: '대화, 안 읽은 대화 3개' });
    expect(button).toHaveTextContent('3');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('id', 'trigger');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
