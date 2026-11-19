// 임대인 앱 임차인 초대(M15, #169).
// 실패 조건: 번호를 바꿨는데 계약을 고치지 않고 초대 · 계약 수정이 실패했는데 초대를 발급 · 번호가 그대로인데 계약을 고침 ·
// 다른 계약을 골랐는데 처음 계약으로 발급 · 링크를 만든 뒤 공유 창을 열지 않음 · 연결된 계약에 초대 폼이 열림 ·
// 계약 관리에서 초대 화면으로 가지 못함.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getContract: vi.fn(),
  getContractList: vi.fn(),
  patchContract: vi.fn(),
  postTenantInvitation: vi.fn(),
  getRenewalNoticeList: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', role: 'LANDLORD' };
const CONTRACT = {
  id: 'c1',
  ownershipId: 'o1',
  property: { id: 'p1', displayName: '테스트아파트 101동 1203호', buildingNo: '101', unitNo: '1203' },
  tenantName: '이임차',
  tenant: { name: '이임차', phone: '01098765432', userId: null, invitationStatus: null },
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 850000,
  rentPaymentDay: 19,
  startDate: '2026-11-01',
  endDate: '2028-10-31',
  status: 'ACTIVE',
  daysUntilEnd: 712,
  previousContractId: null,
  endReason: null,
  isReadOnly: false,
  renewalNotice: null,
};
const NEXT = { ...CONTRACT, id: 'c2', tenantName: '박다음', startDate: '2028-11-01', status: 'UPCOMING', tenant: { ...CONTRACT.tenant, name: '박다음', phone: '01011112222' } };
const INVITATION = { id: 'i1', inviteUrl: 'https://butler.test/invite/tok', expiresAt: '2026-11-26T03:00:00Z', status: 'PENDING', sharedDocumentCount: 0 };

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
};

const renderAt = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

let share;
beforeEach(() => {
  vi.clearAllMocks();
  api.getContract.mockResolvedValue(CONTRACT);
  api.getContractList.mockResolvedValue({ data: [CONTRACT], meta: { page: 1, size: 20, total: 1, hasNext: false } });
  api.patchContract.mockImplementation(async (id, body) => ({ ...CONTRACT, id, tenant: { ...CONTRACT.tenant, phone: body.tenantPhone } }));
  api.postTenantInvitation.mockResolvedValue(INVITATION);
  api.getRenewalNoticeList.mockResolvedValue([]);
  share = vi.fn().mockResolvedValue();
  Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
});
afterEach(() => {
  delete window.navigator.share;
});

const submit = () => userEvent.click(screen.getByRole('button', { name: '초대 링크 보내기' }));

describe('임차인 초대 화면', () => {
  it('계약 번호를 미리 채우고, 그대로면 계약을 고치지 않고 바로 발급한 뒤 공유 창을 연다', async () => {
    renderAt('/landlord/contracts/c1/invite');
    const phone = await screen.findByLabelText('임차인 휴대폰');
    expect(phone).toHaveValue('010-9876-5432');
    expect(screen.getByText('테스트아파트 101동 1203호 · 2026-11-01~')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '임차인이 볼 수 있는 것' })).toBeInTheDocument();

    await submit();

    expect(api.patchContract).not.toHaveBeenCalled();
    expect(api.postTenantInvitation).toHaveBeenCalledWith('c1', { sharedDocumentIds: [] });
    expect(await screen.findByText('초대 링크를 만들었어요')).toBeInTheDocument();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: INVITATION.inviteUrl }));
    expect(screen.getByLabelText('초대 링크')).toHaveValue(INVITATION.inviteUrl);
    expect(await screen.findByText(/링크를 보냈어요/)).toBeInTheDocument();
  });

  it('번호를 바꾸면 계약 연락처를 먼저 고친 뒤 발급한다', async () => {
    renderAt('/landlord/contracts/c1/invite');
    const phone = await screen.findByLabelText('임차인 휴대폰');
    await userEvent.clear(phone);
    await userEvent.type(phone, '01055556666');
    expect(phone).toHaveValue('010-5555-6666');

    await submit();

    expect(api.patchContract).toHaveBeenCalledWith('c1', { tenantPhone: '01055556666' });
    expect(api.postTenantInvitation).toHaveBeenCalledWith('c1', { sharedDocumentIds: [] });
    expect(api.patchContract.mock.invocationCallOrder[0]).toBeLessThan(api.postTenantInvitation.mock.invocationCallOrder[0]);
  });

  it('계약 수정이 실패하면 초대를 발급하지 않고 오류를 보인다', async () => {
    api.patchContract.mockRejectedValue({ response: { status: 422, data: { error: { code: 'CONTRACT_READ_ONLY', message: '수정할 수 없습니다.' } } } });
    renderAt('/landlord/contracts/c1/invite');
    const phone = await screen.findByLabelText('임차인 휴대폰');
    await userEvent.clear(phone);
    await userEvent.type(phone, '01055556666');
    await submit();

    expect(await screen.findByText('끝난 계약이나 소유가 끝난 호실의 계약은 초대할 수 없어요')).toBeInTheDocument();
    expect(api.postTenantInvitation).not.toHaveBeenCalled();
  });

  it('잘못된 번호는 보내지 않는다', async () => {
    renderAt('/landlord/contracts/c1/invite');
    const phone = await screen.findByLabelText('임차인 휴대폰');
    await userEvent.clear(phone);
    await userEvent.type(phone, '0212345678');
    await submit();

    expect(screen.getByText('010으로 시작하는 휴대폰 번호를 입력해 주세요')).toBeInTheDocument();
    expect(api.patchContract).not.toHaveBeenCalled();
    expect(api.postTenantInvitation).not.toHaveBeenCalled();
  });

  it('같은 호실의 다른 계약을 고르면 그 계약 번호로 바뀌고 그 계약으로 발급한다', async () => {
    api.getContractList.mockResolvedValue({ data: [CONTRACT, NEXT], meta: { page: 1, size: 20, total: 2, hasNext: false } });
    renderAt('/landlord/contracts/c1/invite');
    await userEvent.click(await screen.findByRole('button', { name: /연결할 계약/ }));
    expect(api.getContractList).toHaveBeenCalledWith(expect.objectContaining({ ownershipId: 'o1', status: 'ACTIVE,EXPIRING_SOON,UPCOMING' }));

    const sheet = within(screen.getByRole('dialog', { name: '연결할 계약' }));
    await userEvent.click(sheet.getByRole('button', { name: /2028-11-01/ }));

    expect(screen.getByLabelText('임차인 휴대폰')).toHaveValue('010-1111-2222');
    await submit();
    expect(api.postTenantInvitation).toHaveBeenCalledWith('c2', { sharedDocumentIds: [] });
  });

  it('이미 임차인이 연결된 계약이면 폼 없이 안내만', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, tenant: { ...CONTRACT.tenant, userId: 'u-t', invitationStatus: 'ACCEPTED' } });
    renderAt('/landlord/contracts/c1/invite');
    expect(await screen.findByText(/초대할 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByLabelText('임차인 휴대폰')).toBeNull();
  });
});

describe('계약 관리의 초대 카드', () => {
  it('임차인 계정이 없으면 카드를 보이고 [임차인 초대]로 초대 화면에 간다', async () => {
    renderAt('/landlord/contracts/c1');
    const card = within(await screen.findByRole('region', { name: '임차인 초대' }));
    await userEvent.click(card.getByRole('button', { name: '임차인 초대' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/landlord/contracts/c1/invite');
  });

  it('임차인 계정이 연결됐으면 카드가 없다', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, tenant: { ...CONTRACT.tenant, userId: 'u-t', invitationStatus: 'ACCEPTED' } });
    renderAt('/landlord/contracts/c1');
    await screen.findByRole('region', { name: '현재 계약' });
    expect(screen.queryByRole('region', { name: '임차인 초대' })).toBeNull();
  });
});
