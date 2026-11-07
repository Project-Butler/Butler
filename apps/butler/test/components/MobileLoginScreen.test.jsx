// M01 앱 로그인 화면(Figma 3:11). 웹 로그인과 같은 값({ email, password })을 넘기고, 모양만 다르다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileLoginScreen } from '@butler/ui';

const apiError = (message) => Object.assign(new Error(message), { response: { status: 401, data: { error: { code: 'INVALID_CREDENTIALS', message } } } });

describe('MobileLoginScreen (M01)', () => {
  it('Figma 문구(브랜드·제목·설명·주민등록번호 안내)를 보여 주고, API 가 없는 "비밀번호 찾기"는 없다', () => {
    render(<MobileLoginScreen onSubmit={vi.fn()} />);

    expect(screen.getByText('Butler')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('집의 기록을한곳에서 관리하세요');
    expect(screen.getByText('임대인을 위한 내 부동산 관리 공간')).toBeInTheDocument();
    expect(screen.getByText('주민등록번호는 받지 않습니다')).toBeInTheDocument();
    expect(screen.queryByText('비밀번호 찾기')).toBeNull();
  });

  it('이메일·비밀번호를 넣고 [로그인]을 누르면 그 값을 넘긴다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MobileLoginScreen onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('이메일'), 'landapp@butler.test');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ email: 'landapp@butler.test', password: 'password123' }));
  });

  it('로그인에 실패하면 서버 문구를 alert 로 보여 준다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError('이메일 또는 비밀번호가 올바르지 않습니다.'));
    render(<MobileLoginScreen onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('이메일'), 'a@butler.test');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong-pass1');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.');
  });

  it('눈 아이콘으로 비밀번호를 보였다 숨겼다 한다(aria-pressed 로 상태를 알린다)', async () => {
    render(<MobileLoginScreen onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('비밀번호');
    const toggle = screen.getByRole('button', { name: '비밀번호 보기' });
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('처음 오류(initialError)·소셜 로그인 링크·개발 안내·footer 를 보여 준다', () => {
    render(
      <MobileLoginScreen
        onSubmit={vi.fn()}
        initialError="소셜 로그인에 실패했습니다."
        socialLoginHref={(provider) => `/api/v1/auth/oauth/${provider}`}
        devHint="fixture 계정: landapp@butler.test"
        footer={<a href="/register">회원가입</a>}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('소셜 로그인에 실패했습니다.');
    expect(screen.getByRole('link', { name: /구글로 계속하기/ })).toHaveAttribute('href', '/api/v1/auth/oauth/google');
    expect(screen.getByRole('link', { name: /카카오로 계속하기/ })).toHaveAttribute('href', '/api/v1/auth/oauth/kakao');
    expect(screen.getByText('fixture 계정: landapp@butler.test')).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: '로그인' })).getByRole('link', { name: '회원가입' })).toBeInTheDocument();
  });
});
