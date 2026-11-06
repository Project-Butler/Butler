// 앱 라우팅. describe 이름의 T1·T3·T4·T5·T6 은 #97 검증 항목 번호다(로그인 전 접근 · 역할 분리 · from 검증 · 세션 · 소셜 로그인 오류):
//   로그인 전 보호 주소 → /login, 로그인 뒤 원래 가려던 곳(from)은 내 역할 접두어일 때만,
//   다른 역할 주소 → 내 역할 홈(그 사이 다른 역할 화면 렌더·모듈 로드 0건), 임대인만 surface 로 web/app 선택.
// 역할 화면은 가벼운 대역으로 바꾸고, "렌더된 횟수"와 "모듈이 로드된 횟수"를 센다. 보호 화면이 잠깐이라도 그려지거나
// 다른 역할 청크가 로드되면 0이 아니게 되어 실패한다. 테스트마다 vi.resetModules()로 모듈 그래프를 새로 만든다.
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  postLogin: vi.fn(),
  postLogout: vi.fn(),
  postRegister: vi.fn(),
  postOAuthSignup: vi.fn(),
  getOAuthSignup: vi.fn(),
  getOAuthStartUrl: vi.fn(() => '#'),
  postEmailVerification: vi.fn(),
  postEmailVerificationConfirm: vi.fn(),
}));
// 모듈이 로드된 횟수(= 번들이면 청크 로드)와 화면이 렌더된 횟수
const loaded = vi.hoisted(() => ({ admin: 0, landlordWeb: 0, landlordApp: 0, tenant: 0 }));
const rendered = vi.hoisted(() => ({ admin: 0, landlordWeb: 0, landlordApp: 0, tenant: 0 }));
const env = vi.hoisted(() => ({ surface: 'web', nextLogin: null }));

vi.mock('@butler/api-client', () => api);
vi.mock('../src/surface/getSurface', () => ({ getSurface: () => env.surface }));

// 로그인·가입 화면은 입력 칸 대신 버튼 하나로 onSubmit 을 부른다(여기서 보는 것은 라우팅이지 입력 화면이 아니다).
vi.mock('@butler/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // 실제 LoginScreen 처럼 initialError 는 처음 마운트될 때 한 번만 상태로 복사한다(나중에 바뀐 prop 은 반영되지 않는다).
    LoginScreen: ({ onSubmit, initialError, footer }) => {
      const [error] = useState(initialError);
      return (
        <section aria-label="로그인 화면">
          {error && <p role="alert">{error}</p>}
          <button type="button" onClick={() => onSubmit({ email: 'a@butler.test', password: 'password123' })}>
            로그인하기
          </button>
          {footer}
        </section>
      );
    },
    RegisterScreen: ({ onSubmit }) => (
      <section aria-label="가입 화면">
        <button type="button" onClick={() => onSubmit({ name: '김집주', email: 'new@butler.test' })}>
          가입하기
        </button>
      </section>
    ),
    OAuthSignupScreen: ({ onSubmit }) => (
      <section aria-label="소셜 가입 화면">
        <button type="button" onClick={() => onSubmit({ name: '김집주' })}>
          소셜 가입하기
        </button>
      </section>
    ),
  };
});

// 역할 화면 대역. 렌더되면 rendered 가, 모듈이 로드되면 loaded 가 올라간다.
const Probe = ({ name, label, props }) => {
  rendered[name] += 1;
  const navigate = useNavigate();
  return (
    <section aria-label={label}>
      <p>{label} · {props.user.name}</p>
      <button type="button" onClick={() => props.onLogout()}>로그아웃</button>
      <button type="button" onClick={() => props.onUnauthorized()}>세션 끊김</button>
      <button type="button" onClick={() => navigate('/landlord/contracts')}>다른 화면</button>
    </section>
  );
};
// vi.mock 의 팩토리는 vi.resetModules() 뒤에도 다시 실행되지 않아 "로드된 횟수"가 첫 import 에서만 오른다.
// 그래서 테스트마다 vi.doMock 으로 새로 등록해, 이 테스트에서 모듈이 로드됐는지를 정확히 센다.
const registerRoleMocks = () => {
  vi.doMock('../src/admin/AdminRoutes', () => {
    loaded.admin += 1;
    return { AdminRoutes: (props) => <Probe name="admin" label="관리자 화면" props={props} /> };
  });
  vi.doMock('../src/landlord/web/LandlordWebRoutes', () => {
    loaded.landlordWeb += 1;
    return { LandlordWebRoutes: (props) => <Probe name="landlordWeb" label="임대인 웹 화면" props={props} /> };
  });
  vi.doMock('../src/landlord/app/LandlordAppRoutes', () => {
    loaded.landlordApp += 1;
    return { LandlordAppRoutes: (props) => <Probe name="landlordApp" label="임대인 앱 화면" props={props} /> };
  });
  vi.doMock('../src/tenant/TenantRoutes', () => {
    loaded.tenant += 1;
    return { TenantRoutes: (props) => <Probe name="tenant" label="임차인 화면" props={props} /> };
  });
};

// 모듈 그래프를 새로 만들고(카운터 0), 역할 대역을 등록한 뒤 App 을 불러온다.
const importApp = async () => {
  vi.resetModules();
  Object.keys(loaded).forEach((key) => { loaded[key] = 0; rendered[key] = 0; });
  visited.length = 0;
  registerRoleMocks();
  return (await import('../src/App')).App;
};

const USERS = {
  ADMIN: { id: 'a-1', name: '박운영', role: 'ADMIN' },
  LANDLORD: { id: 'l-1', name: '김집주', role: 'LANDLORD' },
  TENANT: { id: 't-1', name: '이세입', role: 'TENANT' },
};

const visited = [];
const LocationProbe = () => {
  const { pathname, search, state } = useLocation();
  visited.push(pathname + search);
  return (
    <>
      <output data-testid="location">{pathname + search}</output>
      <output data-testid="from">{state?.from ?? ''}</output>
    </>
  );
};
const where = () => screen.getByTestId('location').textContent;
const from = () => screen.getByTestId('from').textContent;

// path 로 열고, user 가 있으면 쿠키 세션이 살아 있는 것처럼 getMe 가 사용자를 돌려준다.
const open = async (path, { user = null, surface = 'web' } = {}) => {
  const App = await importApp();
  env.surface = surface;
  if (user) api.getMe.mockResolvedValue({ user, verifiedLegalDongCodes: ['1171010100'] });
  else api.getMe.mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401 } }));
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
};
const loginAs = async (user) => {
  api.postLogin.mockResolvedValue({ user, verifiedLegalDongCodes: [] });
  await userEvent.click(await screen.findByRole('button', { name: '로그인하기' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getOAuthStartUrl.mockReturnValue('#');
  api.postLogout.mockResolvedValue();
});

describe('T1 로그인 전 접근', () => {
  it.each([
    ['/admin/users', '/admin/users'],
    ['/landlord/contracts?status=EXPIRING_SOON', '/landlord/contracts?status=EXPIRING_SOON'],
    ['/tenant/home', '/tenant/home'],
    ['/landlord', '/landlord'],
  ])('보호된 주소 %s → /login, 가려던 곳은 from 에 남는다. 보호 화면은 한 번도 그려지지 않는다', async (path, expectedFrom) => {
    await open(path);
    expect(await screen.findByLabelText('로그인 화면')).toBeInTheDocument();
    expect(where()).toBe('/login');
    expect(from()).toBe(expectedFrom);
    expect(rendered).toEqual({ admin: 0, landlordWeb: 0, landlordApp: 0, tenant: 0 });
    expect(loaded).toEqual({ admin: 0, landlordWeb: 0, landlordApp: 0, tenant: 0 });
  });

  it.each(['/', '/no-such-page'])('루트·모르는 주소 %s → /login', async (path) => {
    await open(path);
    expect(await screen.findByLabelText('로그인 화면')).toBeInTheDocument();
    expect(where()).toBe('/login');
  });

  it('세션을 확인하는 동안에는 로그인 화면도 보호 화면도 그리지 않는다', async () => {
    const App = await importApp();
    let finish;
    api.getMe.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<MemoryRouter initialEntries={['/admin/users']}><App /><LocationProbe /></MemoryRouter>);
    expect(screen.getByText('불러오는 중입니다')).toBeInTheDocument();
    expect(screen.queryByLabelText('로그인 화면')).not.toBeInTheDocument();
    expect(where()).toBe('/admin/users');
    finish({ user: USERS.ADMIN, verifiedLegalDongCodes: [] });
    expect(await screen.findByLabelText('관리자 화면')).toBeInTheDocument();
  });

  it('로그인하면 원래 가려던 곳으로 돌아간다 (내 역할 주소일 때)', async () => {
    await open('/landlord/contracts/c-1');
    await loginAs(USERS.LANDLORD);
    expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
    expect(where()).toBe('/landlord/contracts/c-1');
  });
});

describe('양성 대조: 카운터가 정말 센다 (이게 깨지면 아래 "로드 0건" 단언은 믿을 수 없다)', () => {
  it.each([
    ['ADMIN', '/admin/dashboard', 'admin', '관리자 화면'],
    ['LANDLORD', '/landlord/home', 'landlordWeb', '임대인 웹 화면'],
    ['TENANT', '/tenant/home', 'tenant', '임차인 화면'],
  ])('%s 가 %s 를 열면 %s 모듈이 1번 로드되고 화면이 그려진다', async (role, path, key, label) => {
    await open(path, { user: USERS[role] });
    expect(await screen.findByLabelText(label)).toBeInTheDocument();
    expect(loaded[key]).toBe(1);
    expect(rendered[key]).toBeGreaterThan(0);
  });

  it('임대인 앱(surface=app)이 열리면 앱 모듈이 로드된다', async () => {
    await open('/landlord/home', { user: USERS.LANDLORD, surface: 'app' });
    expect(await screen.findByLabelText('임대인 앱 화면')).toBeInTheDocument();
    expect(loaded.landlordApp).toBe(1);
  });
});

describe('T4 from 검증', () => {
  it('관리자 주소로 가려다 로그인했는데 임대인이면 임대인 홈으로 간다. 관리자 화면은 로드되지 않는다', async () => {
    await open('/admin/users');
    await screen.findByLabelText('로그인 화면');
    expect(from()).toBe('/admin/users');
    await loginAs(USERS.LANDLORD);
    expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
    expect(where()).toBe('/landlord/home');
    expect(loaded.admin).toBe(0);
    expect(rendered.admin).toBe(0);
  });

  it('from 없이 로그인하면 역할 홈', async () => {
    await open('/login');
    await loginAs(USERS.ADMIN);
    expect(await screen.findByLabelText('관리자 화면')).toBeInTheDocument();
    expect(where()).toBe('/admin/dashboard');
  });
});

describe('T3 역할 분리', () => {
  it.each([
    ['LANDLORD', '/admin/users', '/landlord/home', '임대인 웹 화면'],
    ['LANDLORD', '/tenant/home', '/landlord/home', '임대인 웹 화면'],
    ['ADMIN', '/landlord/home', '/admin/dashboard', '관리자 화면'],
    ['TENANT', '/landlord/home', '/tenant/home', '임차인 화면'],
    ['TENANT', '/admin/users', '/tenant/home', '임차인 화면'],
  ])('%s 가 %s 로 들어오면 %s 로 간다. 다른 역할 화면은 그려지지도, 로드되지도 않는다', async (role, path, home, label) => {
    await open(path, { user: USERS[role] });
    expect(await screen.findByLabelText(label)).toBeInTheDocument();
    expect(where()).toBe(home);
    const others = { ADMIN: 'admin', LANDLORD: 'landlordWeb', TENANT: 'tenant' };
    for (const [otherRole, key] of Object.entries(others)) {
      if (otherRole === role) continue;
      expect(rendered[key], `${key} rendered`).toBe(0);
      expect(loaded[key], `${key} loaded`).toBe(0);
    }
  });

  it.each(['/login', '/register', '/register/oauth', '/', '/no-such-page'])(
    '로그인된 상태로 %s 에 오면 역할 홈으로 보낸다',
    async (path) => {
      await open(path, { user: USERS.LANDLORD });
      expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
      expect(where()).toBe('/landlord/home');
    },
  );

  // 역할 문(RequireRole)·로그인 문(GuestOnly)·루트(RootRedirect)가 각각 따로 처리하므로 셋 다 확인한다.
  it.each(['/landlord/home', '/login', '/', '/no-such-page'])('알 수 없는 역할이 %s 로 오면 안내 화면을 보여 주고 이동을 반복하지 않는다', async (path) => {
    await open(path, { user: { id: 'x', name: '이상한', role: 'SUPERUSER' } });
    expect(await screen.findByText(/지원하지 않는 계정/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(visited.length, `주소가 반복해서 바뀌었다: ${visited.join(' → ')}`).toBeLessThanOrEqual(4);
    expect(rendered).toEqual({ admin: 0, landlordWeb: 0, landlordApp: 0, tenant: 0 });
  });
});

describe('임대인은 surface 로 web/app 을 고른다. 관리자·임차인은 고정', () => {
  it('web → 임대인 웹 화면, 앱 화면은 로드되지 않는다', async () => {
    await open('/landlord/home', { user: USERS.LANDLORD, surface: 'web' });
    expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
    expect(loaded.landlordApp).toBe(0);
  });

  it('app → 임대인 앱 화면, 웹 화면은 로드되지 않는다', async () => {
    await open('/landlord/home', { user: USERS.LANDLORD, surface: 'app' });
    expect(await screen.findByLabelText('임대인 앱 화면')).toBeInTheDocument();
    expect(loaded.landlordWeb).toBe(0);
  });

  it('관리자는 surface 가 app 이어도 항상 웹 화면', async () => {
    await open('/admin/dashboard', { user: USERS.ADMIN, surface: 'app' });
    expect(await screen.findByLabelText('관리자 화면')).toBeInTheDocument();
    expect(loaded.landlordApp).toBe(0);
  });

  it.each(['web', 'app'])('임차인은 surface 가 %s 여도 임차인 화면 (항상 앱 화면)', async (surface) => {
    await open('/tenant/home', { user: USERS.TENANT, surface });
    expect(await screen.findByLabelText('임차인 화면')).toBeInTheDocument();
  });
});

describe('T5 세션', () => {
  it('새로고침(= 처음 열기)해도 쿠키 세션이 살아 있으면 로그인이 유지된다', async () => {
    await open('/landlord/contracts/c-1', { user: USERS.LANDLORD });
    expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
    expect(where()).toBe('/landlord/contracts/c-1');
    expect(api.getMe).toHaveBeenCalled();
  });

  it('로그아웃하면 /login 이고, 보던 경로를 from 으로 남기지 않는다', async () => {
    await open('/landlord/home', { user: USERS.LANDLORD });
    await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    expect(await screen.findByLabelText('로그인 화면')).toBeInTheDocument();
    expect(where()).toBe('/login');
    expect(from()).toBe('');
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('로그아웃 뒤 뒤로 가기를 해도 보호된 화면이 그려지지 않는다', async () => {
    const BackButton = () => {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>뒤로</button>;
    };
    const App = await importApp();
    api.getMe.mockResolvedValue({ user: USERS.LANDLORD, verifiedLegalDongCodes: [] });
    render(<MemoryRouter initialEntries={['/landlord/home']}><App /><LocationProbe /><BackButton /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: '다른 화면' }));
    await waitFor(() => expect(where()).toBe('/landlord/contracts'));
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await screen.findByLabelText('로그인 화면');
    const renderedBeforeBack = rendered.landlordWeb;

    await userEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByLabelText('로그인 화면')).toBeInTheDocument();
    expect(where()).toBe('/login');
    expect(rendered.landlordWeb, '뒤로 가기에서 보호 화면이 다시 그려졌다').toBe(renderedBeforeBack);
  });

  it('화면 도중 세션이 끊기면(401) /login 으로 가고, 보던 경로를 from 으로 기억한다', async () => {
    await open('/landlord/home', { user: USERS.LANDLORD });
    await userEvent.click(await screen.findByRole('button', { name: '세션 끊김' }));
    expect(await screen.findByLabelText('로그인 화면')).toBeInTheDocument();
    expect(where()).toBe('/login');
    expect(from()).toBe('/landlord/home');
  });

  it('쿠키가 없으면(세션 없음) /login 으로 간다', async () => {
    await open('/landlord/home');
    expect(await screen.findByLabelText('로그인 화면')).toBeInTheDocument();
    expect(where()).toBe('/login');
  });
});

describe('T6 소셜 로그인 오류', () => {
  it('/login?oauth_error=코드 는 안내 문구를 보여 주고 주소에서 쿼리를 지운다', async () => {
    await open('/login?oauth_error=OAUTH_ROLE_NOT_ALLOWED');
    expect(await screen.findByRole('alert')).toHaveTextContent('임대인 계정만 소셜 로그인을 사용할 수 있습니다.');
    await waitFor(() => expect(where()).toBe('/login'));
  });

  it('모르는 코드는 기본 문구, 코드 문자열은 보여 주지 않는다', async () => {
    await open('/login?oauth_error=SOMETHING_NEW');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('소셜 로그인에 실패했습니다');
    expect(alert).not.toHaveTextContent('SOMETHING_NEW');
  });
});

describe('가입 (임대인만)', () => {
  it('/register 는 가입 화면. 제출하면 role=LANDLORD 로 가입하고 바로 로그인 상태가 되어 임대인 홈으로 간다', async () => {
    api.postRegister.mockResolvedValue({ user: USERS.LANDLORD });
    await open('/register');
    await userEvent.click(await screen.findByRole('button', { name: '가입하기' }));
    expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
    expect(api.postRegister).toHaveBeenCalledWith({ name: '김집주', email: 'new@butler.test', role: 'LANDLORD' });
    expect(where()).toBe('/landlord/home');
  });

  it('/register/oauth 소셜 가입도 마치면 임대인 홈', async () => {
    api.postOAuthSignup.mockResolvedValue({ user: USERS.LANDLORD });
    await open('/register/oauth');
    await userEvent.click(await screen.findByRole('button', { name: '소셜 가입하기' }));
    expect(await screen.findByLabelText('임대인 웹 화면')).toBeInTheDocument();
    expect(where()).toBe('/landlord/home');
  });
});
