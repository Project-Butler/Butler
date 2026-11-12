import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialLoginButtons } from '@butler/ui';

const hrefFor = (provider) => `/api/v1/auth/oauth/${provider}`;
const CHROME = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const KAKAOTALK = `${CHROME} KAKAOTALK 2510130`;
const INSTAGRAM = `${CHROME} Instagram 300.0.0.0`;

describe('SocialLoginButtons', () => {
  it('구글·카카오 링크를 보여 준다', () => {
    render(<SocialLoginButtons hrefFor={hrefFor} userAgent={CHROME} />);

    expect(screen.getByRole('link', { name: /구글로 계속하기/ })).toHaveAttribute('href', '/api/v1/auth/oauth/google');
    expect(screen.getByRole('link', { name: /카카오로 계속하기/ })).toHaveAttribute('href', '/api/v1/auth/oauth/kakao');
  });

  it('일반 브라우저에서는 인앱 브라우저 안내가 없다', () => {
    render(<SocialLoginButtons hrefFor={hrefFor} userAgent={CHROME} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('카카오톡 인앱 브라우저에서는 안내와 외부 브라우저로 여는 링크를 보여 준다', () => {
    render(<SocialLoginButtons hrefFor={hrefFor} userAgent={KAKAOTALK} pageUrl="https://app.example.com/login" />);

    expect(screen.getByRole('note')).toHaveTextContent('구글 로그인이 막힐 수 있습니다');
    expect(screen.getByRole('link', { name: '브라우저로 열기' })).toHaveAttribute(
      'href',
      `kakaotalk://web/openExternal?url=${encodeURIComponent('https://app.example.com/login')}`,
    );
    expect(screen.getByRole('link', { name: /구글로 계속하기/ })).toBeInTheDocument();
  });

  it('다른 인앱 브라우저는 안내만 하고 카카오톡 전용 링크는 없다', () => {
    render(<SocialLoginButtons hrefFor={hrefFor} userAgent={INSTAGRAM} />);

    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '브라우저로 열기' })).not.toBeInTheDocument();
  });
});
