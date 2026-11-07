// M03 임대인 앱 홈(Figma 3:111). 웹 대시보드와 같은 API(계약·호실·소유 관계 목록)로 Figma 칸을 채운다.
// 실패 조건: 숫자가 API 와 다름 · API 없는 칸(검색·알림·수리 요청·전체 보기)이 생김 · 버튼이 엉뚱한 곳으로 감 · 등록 안내가 두 번 보임.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getContractList: vi.fn(),
  getPropertyList: vi.fn(),
  getPropertyOwnershipList: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '최앱주', email: 'landapp@butler.test', role: 'LANDLORD' };
const TODAY = '2026-11-07'; // 토요일

const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });
const contract = (overrides) => ({
  id: 'c1',
  status: 'ACTIVE',
  deposit: 50000000,
  monthlyRent: 500000,
  endDate: '2027-12-31',
  daysUntilEnd: 419,
  nextRentPaymentDate: null,
  property: { id: 'p1', displayName: '래미안 101동 1001호' },
  ...overrides,
});

const LocationProbe = () => {
  const location = useLocation();
  // <output> 은 role=status 라 안내(status)와 겹친다. 그래서 <p> 로 둔다.
  return <p data-testid="location">{`${location.pathname}|${JSON.stringify(location.state)}`}</p>;
};
const where = () => screen.getByTestId('location').textContent.split('|')[0];
const historyState = () => screen.getByTestId('location').textContent.split('|')[1];

const renderAt = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

const withData = () => {
  api.getContractList.mockResolvedValue(
    page([
      contract({ id: 'c1', deposit: 50000000 }),
      contract({ id: 'c2', status: 'EXPIRING_SOON', deposit: 30000000, endDate: '2026-11-14', daysUntilEnd: 7, property: { id: 'p2', displayName: '빌라 202호' } }),
      contract({ id: 'c3', status: 'UPCOMING', deposit: 99000000 }),
      contract({ id: 'c4', deposit: 0, nextRentPaymentDate: TODAY, property: { id: 'p3', displayName: '오피스텔 301호' } }),
    ]),
  );
  api.getPropertyList.mockResolvedValue(page([{ id: 'p1', status: 'LEASED' }, { id: 'p2', status: 'LEASED' }, { id: 'p3', status: 'LEASED' }, { id: 'p4', status: 'VACANT' }]));
  api.getPropertyOwnershipList.mockResolvedValue(
    page([
      { id: 'o1', verificationStatus: 'VERIFIED', property: { id: 'p1' } },
      { id: 'o4', verificationStatus: 'UNVERIFIED', property: { id: 'p4' } },
    ]),
  );
};

const withEmptyAccount = () => {
  api.getContractList.mockResolvedValue(page([]));
  api.getPropertyList.mockResolvedValue(page([]));
  api.getPropertyOwnershipList.mockResolvedValue(page([]));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('M03 홈: 데이터', () => {
  it('웹 대시보드와 같은 조건으로 API 를 부른다', async () => {
    withData();
    renderAt('/landlord/home');
    await screen.findByText('80,000,000원');

    expect(api.getContractList).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'UPCOMING,ACTIVE,EXPIRING_SOON', activeOwnership: 'true', size: 100 }),
    );
    expect(api.getPropertyList).toHaveBeenCalledWith(expect.objectContaining({ relation: 'OWNER', size: 100 }));
    expect(api.getPropertyOwnershipList).toHaveBeenCalledWith(expect.objectContaining({ active: 'true', size: 100 }));
  });

  it('날짜·인사·오늘 할 일 건수, 총 보증금(진행 중만)·부동산 수·계약 중·공실, 권리자 인증을 보여 준다', async () => {
    withData();
    renderAt('/landlord/home');
    const main = within(screen.getByRole('main'));

    expect(await main.findByText('80,000,000원')).toBeInTheDocument();
    expect(main.getByText('2026-11-07 (토)')).toBeInTheDocument();
    expect(main.getByText('안녕하세요, 최앱주님')).toBeInTheDocument();
    expect(main.getByRole('heading', { level: 1 })).toHaveTextContent('오늘 확인할 일 2건');
    expect(main.getByText('부동산 4')).toBeInTheDocument();
    expect(main.getByText('계약 중 3 · 공실 1')).toBeInTheDocument();

    const contractCard = within(main.getByRole('region', { name: '계약 중' }));
    expect(contractCard.getByText('3')).toBeInTheDocument();
    expect(contractCard.getByText('종료 임박 1')).toBeInTheDocument();

    const verifyCard = within(main.getByRole('region', { name: '권리자 인증' }));
    expect(verifyCard.getByText('1 / 2')).toBeInTheDocument();
    expect(verifyCard.getByText('미인증 1')).toBeInTheDocument();
  });

  it('오늘 할 일: 오늘 월세 입금일 · 종료 임박(D-day) 계약이 나온다', async () => {
    withData();
    renderAt('/landlord/home');
    const tasks = within(await screen.findByRole('region', { name: '오늘 할 일' }));

    expect(tasks.getByText('오피스텔 301호 월세 입금일')).toBeInTheDocument();
    expect(tasks.getByText('오늘')).toBeInTheDocument();
    expect(tasks.getByText('빌라 202호 계약 종료')).toBeInTheDocument();
    expect(tasks.getByText('D-7')).toBeInTheDocument();
    expect(tasks.getAllByRole('listitem')).toHaveLength(2);
  });

  it('부동산이 없는 계정(landapp)은 0 과 빈 안내를 보여 주고, 권리자 인증 버튼은 누를 수 없다', async () => {
    withEmptyAccount();
    renderAt('/landlord/home');
    const main = within(screen.getByRole('main'));

    expect(await main.findByText('0원')).toBeInTheDocument();
    expect(main.getByRole('heading', { level: 1 })).toHaveTextContent('오늘 확인할 일 0건');
    expect(main.getByText('부동산 0')).toBeInTheDocument();
    expect(main.getByText('오늘 할 일이 없어요')).toBeInTheDocument();
    expect(main.getByRole('button', { name: '권리자 인증' })).toBeDisabled();
  });

  it('불러오는 중에는 0 대신 — 를 보여 준다', () => {
    api.getContractList.mockReturnValue(new Promise(() => {}));
    api.getPropertyList.mockReturnValue(new Promise(() => {}));
    api.getPropertyOwnershipList.mockReturnValue(new Promise(() => {}));
    renderAt('/landlord/home');

    expect(screen.queryByText('0원')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('오늘 확인할 일 —');
  });

  it('API 오류는 해당 칸에 서버 문구로 보여 준다', async () => {
    withData();
    api.getContractList.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 500, data: { error: { code: 'INTERNAL', message: '계약을 불러오지 못했습니다.' } } } }));
    renderAt('/landlord/home');

    expect((await screen.findAllByText('계약을 불러오지 못했습니다.')).length).toBeGreaterThan(0);
  });
});

describe('M03 홈: API 가 없는 Figma 칸은 두지 않는다', () => {
  it('상단 검색·알림, 수리 요청 항목, 오늘 할 일 [전체 보기]가 없다', async () => {
    withData();
    renderAt('/landlord/home');
    await screen.findByText('80,000,000원');

    const banner = within(screen.getByRole('banner'));
    expect(banner.queryByRole('button', { name: /검색|알림/ })).toBeNull();
    expect(screen.queryByText('전체 보기')).toBeNull();
    expect(screen.queryByText(/보일러|수리 요청/)).toBeNull();
  });
});

describe('M03 홈: 버튼', () => {
  it('[권리자 인증]은 첫 미인증 부동산의 인증 주소로 간다', async () => {
    withData();
    renderAt('/landlord/home');
    const button = await screen.findByRole('button', { name: '권리자 인증' });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);
    expect(where()).toBe('/landlord/properties/p4/verify');
  });

  it('[+ 부동산 등록]은 /landlord/properties/new 로 간다', async () => {
    withData();
    renderAt('/landlord/home');
    await userEvent.click(await screen.findByRole('button', { name: '+ 부동산 등록' }));
    expect(where()).toBe('/landlord/properties/new');
  });
});

describe('M03 홈: 등록 안내(history state)는 한 번만', () => {
  it('state.notice 로 들어오면 안내를 보여 주고, 주소의 state 는 바로 비운다(새로고침·뒤로 가기에 다시 안 보임)', async () => {
    withData();
    renderAt({ pathname: '/landlord/home', state: { notice: '부동산을 등록했어요' } });

    expect(await screen.findByRole('status')).toHaveTextContent('부동산을 등록했어요');
    await waitFor(() => expect(historyState()).toBe('null'));
  });

  it('다른 탭에 갔다가 홈으로 돌아오면 안내가 없다', async () => {
    withData();
    renderAt({ pathname: '/landlord/home', state: { notice: '부동산을 등록했어요' } });
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: '내 자산' }));
    await userEvent.click(screen.getByRole('button', { name: '홈' }));

    await screen.findByText('80,000,000원');
    expect(screen.queryByText('부동산을 등록했어요')).toBeNull();
  });

  it('state 없이 들어오면 안내가 없다', async () => {
    withData();
    renderAt('/landlord/home');
    await screen.findByText('80,000,000원');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
