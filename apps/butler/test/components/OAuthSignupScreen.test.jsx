import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen, OAuthSignupScreen } from '@butler/ui';

const apiError = (status, code, message = '오류') => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });
const info = { provider: 'KAKAO', email: 'kakao@example.com', name: '카카오닉네임' };

describe('OAuthSignupScreen', () => {
  it('제공자가 준 이메일을 고정으로, 이름을 기본값으로 채워 보여 준다', async () => {
    render(<OAuthSignupScreen loadInfo={vi.fn().mockResolvedValue(info)} onSubmit={vi.fn()} />);

    expect(await screen.findByDisplayValue('kakao@example.com')).toBeDisabled();
    expect(screen.getByLabelText(/^이름/)).toHaveValue('카카오닉네임');
    expect(screen.getByText(/카카오 계정으로 로그인했습니다/)).toBeInTheDocument();
  });

  it('로그인 시간이 지났으면(401 OAUTH_SIGNUP_EXPIRED) 안내 문구를 보여 준다', async () => {
    const loadInfo = vi.fn().mockRejectedValue(apiError(401, 'OAUTH_SIGNUP_EXPIRED'));
    render(<OAuthSignupScreen loadInfo={loadInfo} onSubmit={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('소셜 로그인 시간이 지났습니다');
  });

  it('생년월일과 약관 동의 없이는 제출하지 않고 칸별 오류를 보여 준다', async () => {
    const onSubmit = vi.fn();
    render(<OAuthSignupScreen loadInfo={vi.fn().mockResolvedValue(info)} onSubmit={onSubmit} />);
    await screen.findByDisplayValue('kakao@example.com');

    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('생년월일을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('이용약관에 동의해야 가입할 수 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('개인정보 수집·이용에 동의해야 가입할 수 있습니다.')).toBeInTheDocument();
  });

  it('입력을 마치면 이름·휴대폰·생년월일·동의 값을 넘기고, 휴대폰이 비어 있으면 null이다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OAuthSignupScreen loadInfo={vi.fn().mockResolvedValue(info)} onSubmit={onSubmit} />);
    await screen.findByDisplayValue('kakao@example.com');

    await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
    await userEvent.click(screen.getByLabelText(/이용약관에 동의/));
    await userEvent.click(screen.getByLabelText(/개인정보 수집·이용에 동의/));
    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: '카카오닉네임',
      phone: null,
      birthDate: '1990-01-31',
      termsAgreed: true,
      privacyAgreed: true,
    });
  });

  it('서버가 칸별 오류를 주면 그 칸 아래에 보여 준다', async () => {
    const error = Object.assign(new Error('x'), {
      response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: '검증 실패', details: [{ field: 'phone', reason: '휴대폰 번호 형식이 올바르지 않습니다.' }] } } },
    });
    render(<OAuthSignupScreen loadInfo={vi.fn().mockResolvedValue(info)} onSubmit={vi.fn().mockRejectedValue(error)} />);
    await screen.findByDisplayValue('kakao@example.com');

    await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
    await userEvent.click(screen.getByLabelText(/이용약관에 동의/));
    await userEvent.click(screen.getByLabelText(/개인정보 수집·이용에 동의/));
    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));

    expect(await screen.findByText('휴대폰 번호 형식이 올바르지 않습니다.')).toBeInTheDocument();
  });
});

describe('LoginScreen 소셜 로그인', () => {
  it('구글·카카오 링크가 주어진 주소로 향한다', () => {
    render(<LoginScreen onSubmit={vi.fn()} socialLoginHref={(provider) => `http://api.test/auth/oauth/${provider}`} />);

    expect(screen.getByRole('link', { name: /구글로 계속하기/ })).toHaveAttribute('href', 'http://api.test/auth/oauth/google');
    expect(screen.getByRole('link', { name: /카카오로 계속하기/ })).toHaveAttribute('href', 'http://api.test/auth/oauth/kakao');
  });

  it('socialLoginHref가 없으면 링크를 보여 주지 않는다', () => {
    render(<LoginScreen onSubmit={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /계속하기/ })).not.toBeInTheDocument();
  });

  it('initialError가 있으면 처음부터 오류로 보여 준다', () => {
    render(<LoginScreen onSubmit={vi.fn()} initialError="이미 가입된 계정입니다" />);
    expect(screen.getByText('이미 가입된 계정입니다')).toBeInTheDocument();
  });
});
