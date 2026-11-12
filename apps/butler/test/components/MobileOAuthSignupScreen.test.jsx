// 앱 소셜 가입 추가정보 화면. 웹 OAuthSignupScreen 과 같은 입력 항목·규칙·API 호출이고 모양만 모바일(Figma M02 의 폼 모양)이다.
// 실패 조건: 이메일이 고쳐짐 · 필수(생년월일·약관) 없이 제출됨 · 넘기는 값이 웹과 다름 · 서버 오류가 안 보임 · 로그인 시간 만료 안내가 없음.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileOAuthSignupScreen } from '@butler/ui';

const apiError = (status, code, message, details) =>
  Object.assign(new Error(message), { response: { status, data: { error: { code, message, details } } } });
const info = { provider: 'KAKAO', email: 'kakao@example.com', name: '카카오닉네임' };

const renderScreen = (overrides = {}) => {
  const props = { loadInfo: vi.fn().mockResolvedValue(info), onSubmit: vi.fn().mockResolvedValue(undefined), onBack: vi.fn(), ...overrides };
  render(<MobileOAuthSignupScreen {...props} />);
  return props;
};
const ready = () => screen.findByDisplayValue('kakao@example.com');

describe('MobileOAuthSignupScreen', () => {
  it('뒤로 가기 상단 바(회원가입)와 함께, 제공자 이메일은 고정·이름은 기본값으로 보여 준다', async () => {
    renderScreen();

    expect(await ready()).toBeDisabled();
    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^이름/)).toHaveValue('카카오닉네임');
    expect(screen.getByText(/카카오 계정으로 로그인했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '하단 메뉴' })).toBeNull();
  });

  it('불러오는 동안 안내를 보여 주고, 로그인 시간이 지났으면(401 OAUTH_SIGNUP_EXPIRED) 안내 문구를 보여 준다', async () => {
    renderScreen({ loadInfo: vi.fn().mockRejectedValue(apiError(401, 'OAUTH_SIGNUP_EXPIRED')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('소셜 로그인 시간이 지났습니다');
  });

  it('불러오는 중에는 status 안내를 보여 준다', () => {
    renderScreen({ loadInfo: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중입니다');
  });

  it('생년월일과 약관 동의 없이는 제출하지 않고 칸별 오류를 보여 준다', async () => {
    const { onSubmit } = renderScreen();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('생년월일을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('이용약관에 동의해야 가입할 수 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('개인정보 수집·이용에 동의해야 가입할 수 있습니다.')).toBeInTheDocument();
  });

  it('입력을 마치면 웹과 같은 값(빈 휴대폰은 null)을 넘긴다', async () => {
    const { onSubmit } = renderScreen();
    await ready();
    await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
    await userEvent.click(screen.getByLabelText(/이용약관 동의/));
    await userEvent.click(screen.getByLabelText(/개인정보 수집·이용 동의/));
    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ name: '카카오닉네임', phone: null, birthDate: '1990-01-31', termsAgreed: true, privacyAgreed: true });
  });

  it('서버가 칸 오류(phone)를 주면 그 칸 아래에, 칸에 못 붙이는 오류(429)는 alert 로 보여 준다', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(apiError(400, 'VALIDATION_ERROR', '검증 실패', [{ field: 'phone', reason: '휴대폰 번호 형식이 올바르지 않습니다.' }]))
      .mockRejectedValueOnce(apiError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.'));
    renderScreen({ onSubmit });
    await ready();
    await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
    await userEvent.click(screen.getByLabelText(/이용약관 동의/));
    await userEvent.click(screen.getByLabelText(/개인정보 수집·이용 동의/));

    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));
    expect(await screen.findByText('휴대폰 번호 형식이 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해 주세요.');
  });

  it('제출 중에 로그인 시간이 지나면(OAUTH_SIGNUP_EXPIRED) 안내 화면으로 바뀐다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(401, 'OAUTH_SIGNUP_EXPIRED', '만료'));
    renderScreen({ onSubmit });
    await ready();
    await userEvent.type(screen.getByLabelText(/^생년월일/), '1990-01-31');
    await userEvent.click(screen.getByLabelText(/이용약관 동의/));
    await userEvent.click(screen.getByLabelText(/개인정보 수집·이용 동의/));
    await userEvent.click(screen.getByRole('button', { name: '가입 완료' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('소셜 로그인 시간이 지났습니다');
  });

  it('뒤로 가기를 누르면 onBack 이 불린다(로딩 실패 화면에서도)', async () => {
    const { onBack } = renderScreen({ loadInfo: vi.fn().mockRejectedValue(apiError(401, 'OAUTH_SIGNUP_EXPIRED')) });
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
