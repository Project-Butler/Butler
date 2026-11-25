// 사이드바 메뉴를 눌러 활성이 바뀌어도 글자 굵기가 같아 글자 폭이 흔들리지 않는다(활성은 색·배경으로만 구분).
// 실패 조건: 활성 메뉴만 굵기 클래스가 다름.
import { render, screen } from '@testing-library/react';
import { AppShell } from '@butler/ui';
import { describe, expect, it } from 'vitest';

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
