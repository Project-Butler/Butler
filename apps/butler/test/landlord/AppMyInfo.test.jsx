// 임대인 앱 내 정보: 계정 · 권리자 인증(활성 소유 호실별) · 내 권한 · 로그아웃.
// 실패 조건: 인증 완료 호실에 [인증하기]가 보임 · 미인증 호실에 버튼이 없음 · 버튼이 엉뚱한 주소로 감
// · 인증한 동네가 없는데 커뮤니티 쓰기가 가능하다고 보임 · 401에 onUnauthorized 를 안 부름.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getPropertyOwnershipList: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { MyInfoPage } = await import('../../src/landlord/app/pages/MyInfoPage');
const { toVerificationRows } = await import('../../src/landlord/app/utils/myInfoView');

const USER = { id: 'l-1', name: '김집주', email: 'landlord@butler.test', role: 'LANDLORD' };
const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });

const ownership = (id, displayName, extra) => ({
  id,
  property: { id: `p-${id}`, displayName },
  verificationStatus: 'UNVERIFIED',
  verifiedAt: null,
  verificationExpiresAt: null,
  isActive: true,
  ...extra,
});
const VERIFIED = ownership('o1', '래미안 101동 101호', {
  verificationStatus: 'VERIFIED',
  verifiedAt: '2026-09-02T01:00:00Z',
  verificationExpiresAt: '2027-09-02T01:00:00Z',
});
const UNVERIFIED = ownership('o2', '행복빌라 202호');

const LocationProbe = () => {
  const { pathname } = useLocation();
  return <output data-testid="location">{pathname}</output>;
};

const renderPage = ({ verifiedLegalDongCodes = [], onLogout = vi.fn(), onUnauthorized = vi.fn() } = {}) => {
  render(
    <MemoryRouter initialEntries={['/landlord/settings']}>
      <Routes>
        <Route
          path="/landlord/settings"
          element={<MyInfoPage user={USER} verifiedLegalDongCodes={verifiedLegalDongCodes} onLogout={onLogout} onUnauthorized={onUnauthorized} />}
        />
        <Route path="*" element={null} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onLogout, onUnauthorized };
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPropertyOwnershipList.mockResolvedValue(page([VERIFIED, UNVERIFIED]));
});

describe('임대인 앱 내 정보', () => {
  it('계정 카드에 이름 · 임대인 칩 · 이메일이 있다', () => {
    renderPage();
    const account = within(screen.getByRole('region', { name: '계정' }));
    expect(account.getByText('김집주')).toBeInTheDocument();
    expect(account.getByText('임대인')).toBeInTheDocument();
    expect(account.getByText('landlord@butler.test')).toBeInTheDocument();
  });

  it('활성 소유 관계만 받아, 인증 완료는 인증일과 칩, 미인증은 [인증하기]를 보여 준다', async () => {
    renderPage();
    const section = within(screen.getByRole('region', { name: '권리자 인증' }));
    expect(await section.findByText('래미안 101동 101호')).toBeInTheDocument();
    expect(api.getPropertyOwnershipList).toHaveBeenCalledWith(expect.objectContaining({ active: 'true' }));

    const [verifiedRow, unverifiedRow] = section.getAllByRole('listitem');
    expect(within(verifiedRow).getByText('인증 2026-09-02')).toBeInTheDocument();
    expect(within(verifiedRow).getByText('✓ 인증 완료')).toBeInTheDocument();
    expect(within(verifiedRow).queryByRole('button')).not.toBeInTheDocument();

    expect(within(unverifiedRow).getByText('아직 인증하지 않았어요')).toBeInTheDocument();
    await userEvent.click(within(unverifiedRow).getByRole('button', { name: '인증하기' }));
    expect(screen.getByTestId('location').textContent).toBe('/landlord/properties/p-o2/verify');
  });

  it('소유한 호실이 없으면 부동산 등록으로 안내한다', async () => {
    api.getPropertyOwnershipList.mockResolvedValue(page([]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '부동산 등록하기' }));
    expect(screen.getByTestId('location').textContent).toBe('/landlord/properties/new');
  });

  it.each([
    [['1171010100'], '인증한 동네만'],
    [[], '권리자 인증 후 가능'],
  ])('인증 동네 %j → 커뮤니티 글쓰기·투표는 "%s"', (codes, expected) => {
    renderPage({ verifiedLegalDongCodes: codes });
    const permissions = within(screen.getByRole('region', { name: '내 권한' }));
    expect(permissions.getByText('임대인')).toBeInTheDocument();
    expect(permissions.getByText(expected)).toBeInTheDocument();
    expect(permissions.getByText('사용 가능')).toBeInTheDocument();
  });

  it('톱니(알림 설정)는 일정·알림 화면으로, [로그아웃]은 onLogout 을 부른다', async () => {
    const { onLogout } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '알림 설정' }));
    expect(screen.getByTestId('location').textContent).toBe('/landlord/schedules');
  });

  it('목록이 401이면 onUnauthorized 를 부른다', async () => {
    api.getPropertyOwnershipList.mockRejectedValue(
      Object.assign(new Error('401'), { response: { status: 401, data: { error: { code: 'AUTH_REQUIRED', message: '로그인' } } } }),
    );
    const { onUnauthorized } = renderPage();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});

describe('toVerificationRows', () => {
  const now = new Date('2026-11-26T00:00:00Z');

  it('만료 30일 안의 인증 완료·만료는 [재인증하기], 취소는 버튼 없이 칩만', () => {
    const rows = toVerificationRows(
      [
        { ...VERIFIED, verificationExpiresAt: '2026-12-10T01:00:00Z' },
        { ...VERIFIED, id: 'o3', verificationStatus: 'EXPIRED', verificationExpiresAt: '2026-11-01T01:00:00Z' },
        { ...VERIFIED, id: 'o4', verificationStatus: 'REVOKED' },
      ],
      now,
    );
    expect(rows.map((row) => [row.verifyLabel, row.description])).toEqual([
      ['재인증하기', '2026-12-10에 인증 만료'],
      ['재인증하기', '2026-11-01에 인증 만료'],
      [null, '인증 취소 · 관리자에게 문의해 주세요'],
    ]);
  });
});
