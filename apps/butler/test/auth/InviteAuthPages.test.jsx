// 초대에서 온 로그인·가입(결정 11): 보이는 화면은 그대로이고 링크 대상·제출 값·소셜 시작 주소만 바뀐다.
// 화면 컴포넌트는 대역으로 바꿔 "어떤 값이 넘어갔는지"만 본다.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  postLogin: vi.fn(),
  postRegister: vi.fn(),
  getOAuthSignup: vi.fn(),
  postOAuthSignup: vi.fn(),
  getOAuthStartUrl: vi.fn((provider, invite) => (invite ? `/oauth/${provider}?invite=${invite}` : `/oauth/${provider}`)),
  postEmailVerification: vi.fn(),
  postEmailVerificationConfirm: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const store = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../../src/store/sessionStore', () => ({ useSessionStore: (select) => select({ login: store.login }) }));

const Probe = ({ name, onSubmit, socialLoginHref, footer, onBack, initialError }) => (
  <section aria-label={name}>
    {initialError && <p role="alert">{initialError}</p>}
    <p data-testid="social">{socialLoginHref ? socialLoginHref('kakao') : ''}</p>
    {footer}
    {onBack && (
      <button type="button" onClick={onBack}>
        뒤로
      </button>
    )}
    <button type="button" onClick={() => onSubmit({ email: 'a@butler.test', password: 'password123', name: '이세입' })}>
      제출
    </button>
  </section>
);
vi.mock('@butler/ui', () => ({
  LoginScreen: (props) => <Probe name="웹 로그인" {...props} />,
  MobileLoginScreen: (props) => <Probe name="앱 로그인" {...props} />,
  RegisterScreen: (props) => <Probe name="웹 가입" {...props} />,
  MobileRegisterScreen: (props) => <Probe name="앱 가입" {...props} />,
  OAuthSignupScreen: (props) => <Probe name="웹 소셜 가입" {...props} />,
  MobileOAuthSignupScreen: (props) => <Probe name="앱 소셜 가입" {...props} />,
}));

const { LoginPage } = await import('../../src/auth/LoginPage');
const { RegisterPage } = await import('../../src/auth/RegisterPage');
const { OAuthSignupPage } = await import('../../src/auth/OAuthSignupPage');

const LocationProbe = () => {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      <output data-testid="from">{location.state?.from ?? ''}</output>
    </>
  );
};

const renderAt = (entry, element, path = '*') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.postRegister.mockResolvedValue({ user: { id: 'u', role: 'TENANT' } });
  api.postOAuthSignup.mockResolvedValue({ user: { id: 'u', role: 'TENANT' } });
});

describe('LoginPage: 초대에서 왔을 때', () => {
  it('회원가입 링크는 초대 가입으로, 소셜 버튼은 ?invite= 시작 주소로', () => {
    renderAt({ pathname: '/login', state: { from: '/invite/tok' } }, <LoginPage surface="app" />);
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/invite/tok/register');
    expect(screen.getByTestId('social')).toHaveTextContent('/oauth/kakao?invite=tok');
    expect(api.getOAuthStartUrl).toHaveBeenCalledWith('kakao', 'tok');
  });

  it('보통 로그인은 그대로(/register, 초대 없는 시작 주소)', () => {
    renderAt('/login', <LoginPage surface="app" />);
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('social')).toHaveTextContent('/oauth/kakao');
    expect(screen.getByTestId('social')).not.toHaveTextContent('invite');
  });

  it('oauth_error 를 지울 때 돌아갈 곳(from)은 남긴다', async () => {
    renderAt({ pathname: '/login', search: '?oauth_error=OAUTH_DENIED', state: { from: '/invite/tok' } }, <LoginPage surface="app" />);
    expect(screen.getByRole('alert')).toHaveTextContent('소셜 로그인을 취소했습니다');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/));
    expect(screen.getByTestId('from')).toHaveTextContent('/invite/tok');
  });
});

describe('RegisterPage: 초대 가입', () => {
  it('제출에 invitationToken 을 더한다(role 은 서버가 정함 — 검증용 TENANT)', async () => {
    renderAt('/invite/tok/register', <RegisterPage surface="app" invitationToken="tok" />);
    await userEvent.click(screen.getByRole('button', { name: '제출' }));
    expect(api.postRegister).toHaveBeenCalledWith(expect.objectContaining({ invitationToken: 'tok', role: 'TENANT', email: 'a@butler.test' }));
    expect(store.login).toHaveBeenCalledWith({ user: { id: 'u', role: 'TENANT' }, verifiedLegalDongCodes: [] });
  });

  it('보통 가입은 LANDLORD 이고 invitationToken 이 없다', async () => {
    renderAt('/register', <RegisterPage surface="app" />);
    await userEvent.click(screen.getByRole('button', { name: '제출' }));
    expect(api.postRegister).toHaveBeenCalledWith(expect.objectContaining({ role: 'LANDLORD' }));
    expect(api.postRegister.mock.calls[0][0]).not.toHaveProperty('invitationToken');
  });

  it('소셜 버튼은 ?invite= 시작 주소, 로그인 링크·뒤로 가기는 from 을 들고 간다', async () => {
    renderAt('/invite/tok/register', <RegisterPage surface="app" invitationToken="tok" />);
    expect(screen.getByTestId('social')).toHaveTextContent('/oauth/kakao?invite=tok');
    await userEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.getByTestId('from')).toHaveTextContent('/invite/tok');
  });

  it('로그인 링크도 from 을 들고 간다', async () => {
    renderAt('/invite/tok/register', <RegisterPage surface="app" invitationToken="tok" />);
    await userEvent.click(screen.getByRole('link', { name: '로그인' }));
    expect(screen.getByTestId('from')).toHaveTextContent('/invite/tok');
  });
});

describe('OAuthSignupPage: 초대 소셜 가입', () => {
  it('가입 API 는 그대로, 뒤로 가기는 초대 화면', async () => {
    renderAt('/invite/tok/register/oauth', <OAuthSignupPage surface="app" invitationToken="tok" />);
    await userEvent.click(screen.getByRole('button', { name: '제출' }));
    expect(api.postOAuthSignup).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/invite/tok');
  });
});
