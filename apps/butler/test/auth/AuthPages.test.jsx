// 로그인·가입 페이지의 화면 형태 분기(#98): surface 가 app 이면 Figma 모바일 화면(M01·M02), web 이면 기존 웹 화면.
// 어느 쪽이든 같은 API(postLogin · postRegister)를 같은 값으로 부른다. 화면 컴포넌트는 대역으로 바꿔 "무엇이 그려졌고 무엇을 불렀는지"만 본다.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  postLogin: vi.fn(),
  postRegister: vi.fn(),
  getOAuthSignup: vi.fn(),
  postOAuthSignup: vi.fn(),
  getOAuthStartUrl: vi.fn((provider) => `/oauth/${provider}`),
  postEmailVerification: vi.fn(),
  postEmailVerificationConfirm: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const store = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../../src/store/sessionStore', () => ({ useSessionStore: (select) => select({ login: store.login }) }));

const screenProbe = (name) => {
  const ScreenProbe = (props) => (
    <section aria-label={name}>
      {props.devHint && <p data-testid="dev-hint">{props.devHint}</p>}
      <button type="button" onClick={() => props.onSubmit({ email: 'a@butler.test', password: 'password123' })}>
        {name} 제출
      </button>
    </section>
  );
  return ScreenProbe;
};
vi.mock('@butler/ui', () => ({
  LoginScreen: screenProbe('웹 로그인'),
  MobileLoginScreen: screenProbe('앱 로그인'),
  RegisterScreen: screenProbe('웹 가입'),
  MobileRegisterScreen: screenProbe('앱 가입'),
  OAuthSignupScreen: screenProbe('웹 소셜 가입'),
  MobileOAuthSignupScreen: screenProbe('앱 소셜 가입'),
}));

const { LoginPage } = await import('../../src/auth/LoginPage');
const { RegisterPage } = await import('../../src/auth/RegisterPage');
const { OAuthSignupPage } = await import('../../src/auth/OAuthSignupPage');

const renderPage = (element) => render(<MemoryRouter initialEntries={['/login']}>{element}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.postLogin.mockResolvedValue({ user: { id: 'u', role: 'LANDLORD' }, verifiedLegalDongCodes: ['1111010100'] });
  api.postRegister.mockResolvedValue({ user: { id: 'u', role: 'LANDLORD' } });
  api.postOAuthSignup.mockResolvedValue({ user: { id: 'u', role: 'LANDLORD' } });
});

describe('LoginPage 화면 형태 분기', () => {
  it.each([
    ['app', '앱 로그인', '웹 로그인'],
    ['web', '웹 로그인', '앱 로그인'],
  ])('surface=%s 이면 [%s]만 그린다', (surface, shown, hidden) => {
    renderPage(<LoginPage surface={surface} />);
    expect(screen.getByRole('region', { name: shown })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: hidden })).toBeNull();
  });

  it.each(['app', 'web'])('surface=%s 에서도 같은 postLogin 을 부르고 세션에 넣는다', async (surface) => {
    renderPage(<LoginPage surface={surface} />);
    await userEvent.click(screen.getByRole('button', { name: /제출/ }));

    await waitFor(() => expect(store.login).toHaveBeenCalledWith({ user: { id: 'u', role: 'LANDLORD' }, verifiedLegalDongCodes: ['1111010100'] }));
    expect(api.postLogin).toHaveBeenCalledWith({ email: 'a@butler.test', password: 'password123' });
  });

  it.each(['app', 'web'])('surface=%s 개발 안내에 앱 확인용 계정 landapp@butler.test 가 있다', (surface) => {
    renderPage(<LoginPage surface={surface} />);
    expect(screen.getByTestId('dev-hint')).toHaveTextContent('landapp@butler.test');
    expect(screen.getByTestId('dev-hint')).toHaveTextContent('landlord@butler.test');
  });
});

describe('RegisterPage 화면 형태 분기', () => {
  it.each([
    ['app', '앱 가입', '웹 가입'],
    ['web', '웹 가입', '앱 가입'],
  ])('surface=%s 이면 [%s]만 그린다', (surface, shown, hidden) => {
    renderPage(<RegisterPage surface={surface} />);
    expect(screen.getByRole('region', { name: shown })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: hidden })).toBeNull();
  });

  it.each(['app', 'web'])('surface=%s 에서도 postRegister 에 role=LANDLORD 를 붙여 부르고 바로 로그인 상태가 된다', async (surface) => {
    renderPage(<RegisterPage surface={surface} />);
    await userEvent.click(screen.getByRole('button', { name: /제출/ }));

    await waitFor(() => expect(store.login).toHaveBeenCalledWith({ user: { id: 'u', role: 'LANDLORD' }, verifiedLegalDongCodes: [] }));
    expect(api.postRegister).toHaveBeenCalledWith({ email: 'a@butler.test', password: 'password123', role: 'LANDLORD' });
  });
});

describe('OAuthSignupPage 화면 형태 분기', () => {
  it.each([
    ['app', '앱 소셜 가입', '웹 소셜 가입'],
    ['web', '웹 소셜 가입', '앱 소셜 가입'],
  ])('surface=%s 이면 [%s]만 그린다', (surface, shown, hidden) => {
    renderPage(<OAuthSignupPage surface={surface} />);
    expect(screen.getByRole('region', { name: shown })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: hidden })).toBeNull();
  });

  it.each(['app', 'web'])('surface=%s 에서도 같은 postOAuthSignup 을 부르고 바로 로그인 상태가 된다', async (surface) => {
    renderPage(<OAuthSignupPage surface={surface} />);
    await userEvent.click(screen.getByRole('button', { name: /제출/ }));

    await waitFor(() => expect(store.login).toHaveBeenCalledWith({ user: { id: 'u', role: 'LANDLORD' }, verifiedLegalDongCodes: [] }));
    expect(api.postOAuthSignup).toHaveBeenCalledWith({ email: 'a@butler.test', password: 'password123' });
  });
});
