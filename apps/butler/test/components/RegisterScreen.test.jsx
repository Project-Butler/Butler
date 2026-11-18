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

// 도메인은 브랜드색 칸을 눌러 목록에서 고른다.
const pickDomain = async (name) => {
  await userEvent.click(screen.getByRole('button', { name: '이메일 도메인' }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

// 이메일은 @ 앞을 입력하고 @ 뒤는 도메인 목록에서 고른다.
const typeEmail = async (address) => {
  const [local, domain] = address.split('@');
  await userEvent.type(screen.getByLabelText(/^이메일$|^이메일\*/), local);
  await pickDomain(domain);
};

const verifyEmail = async (email = 'new@gmail.com') => {
  await typeEmail(email);
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
  await userEvent.type(screen.getByLabelText(/^휴대폰/), '010-1234-5678');
  await userEvent.click(screen.getByLabelText(/이용약관에 동의/));
  await userEvent.click(screen.getByLabelText(/개인정보 수집·이용에 동의/));
};

describe('RegisterScreen (웹)', () => {
  it('이메일 인증 없이 제출하면 보내지 않고 "이메일 인증을 완료해주세요"를 보여 준다', async () => {
    const { onSubmit } = renderScreen();
    await typeEmail('new@gmail.com');
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('이메일 인증을 완료해주세요.')).toBeInTheDocument();
  });

  it('인증을 마치고 제출하면 모든 값과 인증 토큰을 넘긴다', async () => {
    const { onSubmit, onRequestEmailCode, onConfirmEmailCode } = renderScreen();
    await verifyEmail();
    await fillProfile();

    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onRequestEmailCode).toHaveBeenCalledWith('new@gmail.com');
    expect(onConfirmEmailCode).toHaveBeenCalledWith('new@gmail.com', '123456');
    expect(onSubmit).toHaveBeenCalledWith({
      name: '김집주',
      email: 'new@gmail.com',
      password: 'abcd1234',
      phone: '010-1234-5678',
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

  it('이메일은 @ 앞만 입력하고 자동완성이 꺼져 있다', () => {
    renderScreen();
    const local = screen.getByLabelText(/^이메일\*?$/);

    expect(local).toHaveAttribute('autocomplete', 'off');
    expect(local).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: '이메일 도메인' })).toBeInTheDocument();
  });

  it('도메인 목록에 없으면 직접 입력으로 합친 주소를 보낸다', async () => {
    const props = renderScreen();
    await userEvent.type(screen.getByLabelText(/^이메일\*?$/), 'owner');
    await pickDomain('직접 입력');
    await userEvent.type(screen.getByLabelText('이메일 도메인 직접 입력'), 'butler.test');
    await userEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(props.onRequestEmailCode).toHaveBeenCalledWith('owner@butler.test');
  });

  it('전체 주소를 붙여 넣으면 @ 뒤를 도메인 칸으로 나눈다', async () => {
    const props = renderScreen();
    await userEvent.click(screen.getByLabelText(/^이메일\*?$/));
    await userEvent.paste('owner@naver.com');

    expect(screen.getByLabelText(/^이메일\*?$/)).toHaveValue('owner');
    expect(screen.getByRole('button', { name: '이메일 도메인' })).toHaveTextContent('naver.com');
    await userEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    expect(props.onRequestEmailCode).toHaveBeenCalledWith('owner@naver.com');
  });

  it('인증번호 요청이 끝나기 전에 입력칸을 먼저 보여 준다', async () => {
    renderScreen({ onRequestEmailCode: vi.fn(() => new Promise(() => {})) });
    await typeEmail('new@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(screen.getByLabelText('인증번호')).toBeInTheDocument();
  });

  it('처음 인증번호 요청이 실패하면 입력칸을 다시 숨기고 오류를 보여 준다', async () => {
    renderScreen({ onRequestEmailCode: vi.fn().mockRejectedValue(apiError(502, 'EMAIL_SEND_FAILED', '인증 메일을 보내지 못했습니다.')) });
    await typeEmail('new@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByText('인증 메일을 보내지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByLabelText('인증번호')).toBeNull();
  });
});
