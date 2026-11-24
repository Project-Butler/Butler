// Created: 2026-11-24 15:32
// 임대인 앱 계약 등록(S-02, POST /contracts)과 계약 관리의 [갱신 계약 등록].
// 실패 조건: 인증 안 된 호실이 고를 목록에 나옴 · 주소의 호실을 미리 고르지 않음 · 필수 칸이 비었는데 등록할 수 있음 ·
// 등록 뒤 임차인 초대 화면으로 가지 않거나 뒤로 가면 등록 폼이 다시 나옴 · 갱신인데 이전 계약 값을 채우지 않거나 호실을 바꿀 수 있음 ·
// 갱신 등록에 previousContractId 를 보내지 않음 · 끝난 계약·읽기 전용 계약에 [갱신 계약 등록]이 보임 · 계약서로 채우기가 없음.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getContract: vi.fn(),
  getContractList: vi.fn(),
  getPropertyList: vi.fn(),
  postContract: vi.fn(),
  postContractOcr: vi.fn(),
  getRenewalNoticeList: vi.fn(),
  getContractThread: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', role: 'LANDLORD' };
const page = (items) => ({ data: items, meta: { page: 1, size: 100, total: items.length, hasNext: false } });

const VERIFIED = {
  id: 'p1',
  displayName: '테스트아파트 101동 1203호',
  status: 'VACANT',
  myRelation: { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' },
};
const UNVERIFIED = {
  id: 'p2',
  displayName: '테스트아파트 101동 1204호',
  status: 'VACANT',
  myRelation: { type: 'OWNER', ownershipId: 'o2', verificationStatus: 'UNVERIFIED' },
};
const PREVIOUS = {
  id: 'c1',
  ownershipId: 'o1',
  property: { id: 'p1', displayName: VERIFIED.displayName, buildingNo: '101', unitNo: '1203' },
  tenantName: '이임차',
  tenant: { name: '이임차', phone: '01098765432', userId: 'u-t', invitationStatus: null },
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 850000,
  rentPaymentDay: 19,
  startDate: '2024-12-01',
  endDate: '2026-11-30',
  memo: '이전 메모',
  status: 'EXPIRING_SOON',
  daysUntilEnd: 6,
  previousContractId: null,
  endReason: null,
  isReadOnly: false,
  renewalNotice: null,
};

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
};

// 뒤로 가기(-1)를 눌러 볼 수 있게 화면 밖에 버튼을 둔다.
const BackProbe = () => {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="history-back" onClick={() => navigate(-1)}>
      history back
    </button>
  );
};

const renderAt = (entries) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
      <BackProbe />
    </MemoryRouter>,
  );

const where = () => screen.getByTestId('location').textContent;
const submitButton = () => screen.getByRole('button', { name: '계약 등록' });

beforeEach(() => {
  vi.clearAllMocks();
  api.getPropertyList.mockResolvedValue(page([VERIFIED, UNVERIFIED]));
  api.getContract.mockResolvedValue(PREVIOUS);
  api.getContractList.mockResolvedValue(page([]));
  api.getRenewalNoticeList.mockResolvedValue([]);
  api.getContractThread.mockResolvedValue(null);
  api.postContract.mockImplementation(async (body) => ({ ...PREVIOUS, id: 'c-new', ...body, status: 'UPCOMING' }));
});

describe('앱 계약 등록', () => {
  it('인증 완료 호실만 고를 수 있고, 주소의 호실을 미리 고른다', async () => {
    renderAt(['/landlord/contracts/new?propertyId=p1']);
    const select = await screen.findByLabelText(/호실/);
    await screen.findByRole('option', { name: /1203호/ });
    expect(select).toHaveValue('p1');
    expect(screen.queryByRole('option', { name: /1204호/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('heading', { name: '계약 등록' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계약서로 채우기' })).toBeEnabled();
  });

  it('필수 칸을 다 채워야 등록할 수 있고, 등록하면 임차인 초대 화면으로 가며 뒤로 가도 등록 폼이 나오지 않는다', async () => {
    const user = userEvent.setup();
    renderAt(['/landlord/home', '/landlord/contracts/new?propertyId=p1']);
    await screen.findByRole('option', { name: /1203호/ });
    expect(submitButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '전세' }));
    await user.type(screen.getByLabelText(/보증금/), '300000000');
    await user.type(screen.getByLabelText(/시작일/), '2026-12-01');
    await user.type(screen.getByLabelText(/종료일/), '2028-11-30');
    await user.type(screen.getByLabelText(/임차인 이름/), '박새집');
    await user.type(screen.getByLabelText(/연락처/), '01011112222');
    expect(submitButton()).toBeEnabled();

    await user.click(submitButton());
    expect(api.postContract).toHaveBeenCalledWith(
      expect.objectContaining({
        ownershipId: 'o1',
        leaseType: 'JEONSE',
        deposit: 300000000,
        startDate: '2026-12-01',
        endDate: '2028-11-30',
        tenantName: '박새집',
        tenantPhone: '01011112222',
        previousContractId: null,
      }),
    );
    expect(where()).toBe('/landlord/contracts/c-new/invite');

    await user.click(screen.getByTestId('history-back'));
    expect(where()).toBe('/landlord/home');
  });

  it('갱신(renewFrom)은 이전 계약 값과 다음 기간을 채우고, 호실을 잠그고, previousContractId 를 보낸다', async () => {
    const user = userEvent.setup();
    renderAt(['/landlord/contracts/new?renewFrom=c1']);
    // 이전 계약을 불러오는 동안의 화면에도 같은 제목이 있어서, 폼(호실 목록)이 뜬 뒤에 본다.
    await screen.findByRole('option', { name: /1203호/ });
    expect(within(screen.getByRole('banner')).getByRole('heading', { name: '갱신 계약 등록' })).toBeInTheDocument();
    expect(screen.getByLabelText(/호실/)).toBeDisabled();
    expect(screen.getByLabelText(/호실/)).toHaveValue('p1');
    expect(screen.getByLabelText(/시작일/)).toHaveValue('2026-12-01');
    expect(screen.getByRole('region', { name: '이전 계약' })).toHaveTextContent('2024-12-01 ~ 2026-11-30');

    await user.click(submitButton());
    expect(api.postContract).toHaveBeenCalledWith(expect.objectContaining({ ownershipId: 'o1', previousContractId: 'c1', tenantName: '이임차', memo: null }));
  });

  it('계약할 수 있는 호실이 없으면 안내하고 내 자산으로 보낸다', async () => {
    const user = userEvent.setup();
    api.getPropertyList.mockResolvedValue(page([UNVERIFIED]));
    renderAt(['/landlord/contracts/new']);
    await user.click(await screen.findByRole('button', { name: '내 자산으로 가기' }));
    expect(where()).toBe('/landlord/buildings');
  });
});

describe('앱 계약 관리의 [갱신 계약 등록]', () => {
  it('진행 중 계약이면 보이고, 누르면 갱신 계약 등록 화면으로 간다', async () => {
    const user = userEvent.setup();
    renderAt(['/landlord/contracts/c1']);
    await user.click(await screen.findByRole('button', { name: '갱신 계약 등록' }));
    expect(where()).toBe('/landlord/contracts/new?renewFrom=c1');
  });

  it.each([
    ['끝난 계약', { status: 'EXPIRED', isReadOnly: true }],
    ['시작 전 계약', { status: 'UPCOMING' }],
    ['읽기 전용 계약', { isReadOnly: true }],
  ])('%s에는 보이지 않는다', async (_label, patch) => {
    api.getContract.mockResolvedValue({ ...PREVIOUS, ...patch });
    renderAt(['/landlord/contracts/c1']);
    await screen.findByRole('button', { name: '계약 수정' });
    expect(screen.queryByRole('button', { name: '갱신 계약 등록' })).not.toBeInTheDocument();
  });
});
