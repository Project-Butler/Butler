// M02 앱 회원가입(Figma 3:49). 웹과 같은 항목·규칙·API(useRegisterForm)를 1단계(계정) · 2단계(본인 정보)로 나눈다.
// 실패 조건: 단계를 건너뛰어 제출됨 · 넘기는 값이 웹과 다름 · 서버 오류가 엉뚱한 단계에 숨음 · API 없는 Figma 항목이 생김.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileRegisterScreen } from '@butler/ui';

const apiError = (status, code, message, details) =>
  Object.assign(new Error(message), { response: { status, data: { error: { code, message, details } } } });

const renderScreen = (overrides = {}) => {
  const props = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onRequestEmailCode: vi.fn().mockResolvedValue({ resendAfterSeconds: 60 }),
    onConfirmEmailCode: vi.fn().mockResolvedValue({ verificationToken: 'token-1' }),
    onBack: vi.fn(),
    ...overrides,
  };
  render(<MobileRegisterScreen {...props} />);
  return props;
};

const password = () => screen.getByLabelText(/^비밀번호\*?$/);
const next = () => userEvent.click(screen.getByRole('button', { name: '다음 · 본인 확인' }));

const fillAccount = async ({ verify = true } = {}) => {
  await userEvent.type(screen.getByLabelText(/^이름/), '김집주');
  await userEvent.type(screen.getByLabelText(/^이메일/), 'new@butler.test');
  if (verify) {
    await userEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    await userEvent.type(await screen.findByLabelText('인증번호'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    await screen.findByText('인증 완료');
  }
  await userEvent.type(password(), 'abcd1234');
  await userEvent.type(screen.getByLabelText(/^비밀번호 확인/), 'abcd1234');
};

const fillProfile = async () => {
  await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
  await userEvent.click(screen.getByLabelText(/이용약관 동의/));
  await userEvent.click(screen.getByLabelText(/개인정보 수집·이용 동의/));
};

describe('MobileRegisterScreen (M02)', () => {
  it('1단계는 계정 칸만 있고(1 / 2), 휴대폰 인증·[선택] 알림 수신처럼 API 가 없는 항목은 없다', () => {
    renderScreen();

    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '계정 만들기' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^생년월일/)).toBeNull();
    expect(screen.queryByLabelText(/^휴대폰/)).toBeNull();
    expect(screen.queryByText(/일정·알림 수신/)).toBeNull();
  });

  it('빈 칸으로 [다음]을 누르면 1단계에 남아 칸별 오류를 보여 주고, 아무것도 보내지 않는다', async () => {
    const { onSubmit } = renderScreen();
    await next();

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('이름을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('이메일을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('비밀번호를 입력해주세요.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('이메일 인증 없이는 2단계로 넘어가지 않는다', async () => {
    renderScreen();
    await fillAccount({ verify: false });
    await next();

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('이메일 인증을 완료해주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^이메일/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('1단계를 마치면 2단계(본인 정보)로 가고, 2단계에는 휴대폰 "인증번호 받기"가 없다', async () => {
    renderScreen();
    await fillAccount();
    await next();

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '본인 정보' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^휴대폰/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /인증번호 받기/ })).toBeNull();
  });

  it('2단계에서 약관에 동의하지 않으면 보내지 않는다', async () => {
    const { onSubmit } = renderScreen();
    await fillAccount();
    await next();
    await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('이용약관에 동의해야 가입할 수 있습니다.')).toBeInTheDocument();
  });

  it('[가입하기]는 웹과 같은 값(인증 토큰 포함, 빈 휴대폰은 null)을 넘긴다', async () => {
    const { onSubmit } = renderScreen();
    await fillAccount();
    await next();
    await fillProfile();
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: '김집주',
      email: 'new@butler.test',
      password: 'abcd1234',
      phone: null,
      birthDate: '1990-01-31',
      termsAgreed: true,
      privacyAgreed: true,
      emailVerificationToken: 'token-1',
    });
  });

  it('2단계의 뒤로 가기는 입력을 지우지 않고 1단계로, 1단계의 뒤로 가기는 onBack 을 부른다', async () => {
    const { onBack } = renderScreen();
    await fillAccount();
    await next();

    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText(/^이름/)).toHaveValue('김집주');
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('서버가 1단계 칸 오류(EMAIL_ALREADY_EXISTS)를 주면 1단계로 돌아가 이메일 아래에 보여 준다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(409, 'EMAIL_ALREADY_EXISTS', '이미 가입된 이메일입니다.'));
    renderScreen({ onSubmit });
    await fillAccount();
    await next();
    await fillProfile();
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    expect(await screen.findByText('이미 가입된 이메일입니다.')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('서버가 2단계 칸 오류(phone)를 주면 2단계에 남아 그 칸 아래에 보여 준다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      apiError(400, 'VALIDATION_ERROR', '검증 실패', [{ field: 'phone', reason: '휴대폰 번호 형식이 올바르지 않습니다.' }]),
    );
    renderScreen({ onSubmit });
    await fillAccount();
    await next();
    await fillProfile();
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    expect(await screen.findByText('휴대폰 번호 형식이 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('칸에 붙일 수 없는 오류(429)는 지금 단계에서 alert 로 보여 준다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.'));
    renderScreen({ onSubmit });
    await fillAccount();
    await next();
    await fillProfile();
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해 주세요.');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('소셜 가입 링크를 1단계에 보여 준다', () => {
    renderScreen({ socialLoginHref: (provider) => `/oauth/${provider}` });
    expect(screen.getByRole('link', { name: /카카오로 계속하기/ })).toHaveAttribute('href', '/oauth/kakao');
  });
});
