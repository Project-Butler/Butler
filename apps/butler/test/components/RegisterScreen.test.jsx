// 웹 회원가입 화면(RegisterScreen)의 현재 동작을 고정한다. #98 에서 입력 상태·검증을 useRegisterForm 으로 꺼내
// 앱 화면(MobileRegisterScreen)과 같이 쓰게 되므로, 꺼낸 뒤에도 웹 동작이 그대로인지 이 테스트가 지킨다.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegisterScreen } from '@butler/ui';

const apiError = (status, code, message, details) =>
  Object.assign(new Error(message), { response: { status, data: { error: { code, message, details } } } });

const renderScreen = (overrides = {}) => {
  const props = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onRequestEmailCode: vi.fn().mockResolvedValue({ resendAfterSeconds: 60 }),
    onConfirmEmailCode: vi.fn().mockResolvedValue({ verificationToken: 'token-1' }),
    ...overrides,
  };
  render(<RegisterScreen {...props} />);
  return props;
};

const verifyEmail = async (email = 'new@butler.test') => {
  await userEvent.type(screen.getByLabelText(/^이메일/), email);
  await userEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
  await userEvent.type(await screen.findByLabelText('인증번호'), '123456');
  await userEvent.click(screen.getByRole('button', { name: '확인' }));
  await screen.findByText('인증 완료');
};

const fillProfile = async () => {
  await userEvent.type(screen.getByLabelText(/^이름/), '김집주');
  await userEvent.type(screen.getByLabelText(/^비밀번호$|^비밀번호\*/), 'abcd1234');
  await userEvent.type(screen.getByLabelText(/^비밀번호 확인/), 'abcd1234');
  await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
  await userEvent.click(screen.getByLabelText(/이용약관에 동의/));
  await userEvent.click(screen.getByLabelText(/개인정보 수집·이용에 동의/));
};

describe('RegisterScreen (웹)', () => {
  it('이메일 인증 없이 제출하면 보내지 않고 "이메일 인증을 완료해주세요"를 보여 준다', async () => {
    const { onSubmit } = renderScreen();
    await userEvent.type(screen.getByLabelText(/^이메일/), 'new@butler.test');
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('이메일 인증을 완료해주세요.')).toBeInTheDocument();
  });

  it('인증을 마치고 제출하면 모든 값과 인증 토큰을 넘기고, 휴대폰이 비면 null 이다', async () => {
    const { onSubmit, onRequestEmailCode, onConfirmEmailCode } = renderScreen();
    await verifyEmail();
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onRequestEmailCode).toHaveBeenCalledWith('new@butler.test');
    expect(onConfirmEmailCode).toHaveBeenCalledWith('new@butler.test', '123456');
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

  it('비밀번호에 숫자가 없거나 확인과 다르면 칸 아래에 오류를 보여 준다', async () => {
    const { onSubmit } = renderScreen();
    await userEvent.type(screen.getByLabelText(/^비밀번호$|^비밀번호\*/), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByText('비밀번호는 영문과 숫자를 모두 포함해야 합니다.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/^비밀번호$|^비밀번호\*/));
    await userEvent.type(screen.getByLabelText(/^비밀번호$|^비밀번호\*/), 'abcd1234');
    await userEvent.type(screen.getByLabelText(/^비밀번호 확인/), 'abcd9999');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('서버가 EMAIL_ALREADY_EXISTS 를 주면 이메일 칸 아래에 그 문구를 보여 준다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(409, 'EMAIL_ALREADY_EXISTS', '이미 가입된 이메일입니다.'));
    renderScreen({ onSubmit });
    await verifyEmail();
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByText('이미 가입된 이메일입니다.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('칸에 붙일 수 없는 오류(429 등)는 위쪽 안내(alert)로 보여 준다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.'));
    renderScreen({ onSubmit });
    await verifyEmail();
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해 주세요.');
  });

  it('인증이 만료됐다(EMAIL_NOT_VERIFIED)면 인증을 처음부터 다시 받게 한다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(400, 'EMAIL_NOT_VERIFIED', '이메일 인증이 만료되었습니다.'));
    renderScreen({ onSubmit });
    await verifyEmail();
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(await screen.findByText('이메일 인증이 만료되었습니다.')).toBeInTheDocument();
    expect(screen.queryByText('인증 완료')).toBeNull();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
  });
});
