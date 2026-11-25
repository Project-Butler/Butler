// Created: 2026-11-25
// 임대인 앱 부동산 상세의 호실 삭제(소유 종료, POST /property-ownerships/:id/end).
// 실패 조건: 소유 중이 아닌 호실에 [호실 삭제]가 보임 · 확인 없이 바로 지움 · 고른 사유를 보내지 않거나 매도에 SOLD 를 빼먹음 ·
// 취소했는데 요청이 나감 · 서버 오류(진행 중 계약)를 보여 주지 않음 · 지운 뒤 상세에 그대로 남음 · 401에 onUnauthorized 를 안 부름.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getContractList: vi.fn(),
  getPropertyList: vi.fn(),
  getPropertyOwnershipList: vi.fn(),
  getProperty: vi.fn(),
  getComplex: vi.fn(),
  getManagementLogList: vi.fn(),
  getLatestOwnershipVerification: vi.fn(),
  getPropertyOwnership: vi.fn(),
  getPropertyDocumentBox: vi.fn(),
  postPropertyOwnershipEnd: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', role: 'LANDLORD' };
const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });
const apiError = (status, code, message) =>
  Object.assign(new Error(String(status)), { response: { status, data: { error: { code, message } } } });

const PROPERTY = {
  id: 'p1',
  displayName: '래미안 101동 101호',
  complex: { id: 'cx1', name: '래미안', roadAddress: '서울시 강남구 테헤란로 12' },
  buildingNo: '101',
  unitNo: '101',
  exclusiveArea: 84.92,
  status: 'VACANT',
  myRelation: { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' },
  createdAt: '2026-09-02T01:00:00.000Z',
};

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
};
const where = () => screen.getByTestId('location').textContent;

// 내 자산에서 상세로 들어온 상태로 그린다(삭제하면 내 자산으로 돌아가는지 보려고).
const renderDetail = (onUnauthorized = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={['/landlord/buildings', '/landlord/properties/p1']} initialIndex={1}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={onUnauthorized} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onUnauthorized };
};

const openSheet = async () => {
  await userEvent.click(await within(screen.getByRole('banner')).findByRole('button', { name: '더보기' }));
  await userEvent.click(within(screen.getByRole('menu', { name: '더보기' })).getByRole('menuitem', { name: '호실 삭제' }));
  return screen.getByRole('dialog', { name: '호실 삭제' });
};

beforeEach(() => {
  Object.values(api).filter((fn) => typeof fn === 'function').forEach((fn) => fn.mockReset());
  api.getProperty.mockResolvedValue(PROPERTY);
  api.getComplex.mockResolvedValue({ id: 'cx1', roadAddress: '서울시 강남구 테헤란로 12', region: { fullName: '서울특별시 강남구 역삼동' } });
  api.getPropertyOwnership.mockResolvedValue({ id: 'o1', verificationStatus: 'VERIFIED', verifiedAt: '2026-09-05T01:00:00.000Z', isActive: true });
  api.getLatestOwnershipVerification.mockResolvedValue(null);
  api.getContractList.mockResolvedValue(page([]));
  api.getManagementLogList.mockResolvedValue(page([]));
  api.getPropertyDocumentBox.mockResolvedValue({ ownership: [], contracts: [] });
  api.getPropertyList.mockResolvedValue(page([]));
  api.getPropertyOwnershipList.mockResolvedValue(page([]));
  api.postPropertyOwnershipEnd.mockResolvedValue({ id: 'o1', isActive: false, endedAt: '2026-11-25T01:00:00.000Z' });
});

describe('앱 부동산 상세: 호실 삭제', () => {
  it('⋯ 메뉴 맨 아래 [호실 삭제]는 확인 시트를 열고, 바로 지우지 않는다', async () => {
    renderDetail();
    const sheet = await openSheet();
    expect(within(sheet).getByText('이 호실을 삭제할까요?')).toBeInTheDocument();
    expect(within(sheet).getByText(/진행 중인 계약이 있으면 삭제할 수 없어요/)).toBeInTheDocument();
    expect(api.postPropertyOwnershipEnd).not.toHaveBeenCalled();
  });

  it('사유 없이 삭제하면 빈 본문을 보내고, 끝나면 이전 화면(내 자산)으로 간다', async () => {
    renderDetail();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('button', { name: '호실 삭제' }));
    expect(api.postPropertyOwnershipEnd).toHaveBeenCalledWith('o1', {});
    await waitFor(() => expect(where()).toBe('/landlord/buildings'));
  });

  it('매도를 고르면 안내가 바뀌고 SOLD 로 보낸다. 고른 칸을 다시 누르면 풀린다', async () => {
    renderDetail();
    const sheet = await openSheet();
    const sold = within(sheet).getByRole('button', { name: '매도' });
    await userEvent.click(sold);
    expect(sold).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByText(/매도는 진행 중인 계약이 있어도 종료돼요/)).toBeInTheDocument();
    await userEvent.click(sold);
    expect(sold).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(sheet).getByRole('button', { name: '매도' }));
    await userEvent.click(within(sheet).getByRole('button', { name: '호실 삭제' }));
    expect(api.postPropertyOwnershipEnd).toHaveBeenCalledWith('o1', { reason: '매도', endReason: 'SOLD' });
  });

  it('증여는 사유만 보낸다(서버 기본 종료 유형)', async () => {
    renderDetail();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('button', { name: '증여' }));
    await userEvent.click(within(sheet).getByRole('button', { name: '호실 삭제' }));
    expect(api.postPropertyOwnershipEnd).toHaveBeenCalledWith('o1', { reason: '증여' });
  });

  it('[취소]는 시트만 닫고 요청하지 않는다', async () => {
    renderDetail();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '호실 삭제' })).not.toBeInTheDocument();
    expect(api.postPropertyOwnershipEnd).not.toHaveBeenCalled();
    expect(where()).toBe('/landlord/properties/p1');
  });

  it('서버가 막으면(진행 중 계약) message 를 시트 안에 보여 주고 상세에 남는다', async () => {
    api.postPropertyOwnershipEnd.mockRejectedValue(apiError(409, 'OWNERSHIP_HAS_ACTIVE_CONTRACT', '진행 중인 계약이 있어 삭제할 수 없습니다.'));
    renderDetail();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('button', { name: '호실 삭제' }));
    expect(await within(sheet).findByText('진행 중인 계약이 있어 삭제할 수 없습니다.')).toBeInTheDocument();
    expect(where()).toBe('/landlord/properties/p1');
  });

  it('401이면 onUnauthorized', async () => {
    api.postPropertyOwnershipEnd.mockRejectedValue(apiError(401, 'AUTH_REQUIRED', '로그인'));
    const { onUnauthorized } = renderDetail();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('button', { name: '호실 삭제' }));
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('지금 소유 중이 아닌 호실(예전 소유)에는 [호실 삭제]가 없다', async () => {
    api.getProperty.mockResolvedValue({ ...PROPERTY, myRelation: { type: 'FORMER_OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' } });
    renderDetail();
    expect(await screen.findByText('서울특별시 강남구 역삼동')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: '더보기' })).not.toBeInTheDocument();
  });
});
