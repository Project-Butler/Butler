// Created: 2026-11-25
// 임대인 앱 부동산 상세 [기본 정보]의 호실 정보(PATCH /properties/:id)·임대 조건·내 소유 정보(PATCH /property-ownerships/:id) 카드와 하단 시트 수정.
// 실패 조건: 카드가 안 보임 · 웹과 다른 본문을 보냄 · 저장 뒤 다시 읽지 않음 · 잘못된 취득 연월·층으로 저장됨 · 인증 전에 면적·층을 고칠 수 있음 ·
// 서버 칸 오류를 칸 아래에 붙이지 않음 · [취소]에 요청이 나감 · 예전 소유 호실에 [수정]이 보이거나 소유 종료 날짜가 없음.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getContractList: vi.fn(),
  getProperty: vi.fn(),
  getComplex: vi.fn(),
  getManagementLogList: vi.fn(),
  getLatestOwnershipVerification: vi.fn(),
  getPropertyOwnership: vi.fn(),
  getPropertyDocumentBox: vi.fn(),
  patchPropertyOwnership: vi.fn(),
  patchProperty: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', role: 'LANDLORD' };
const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });
const apiError = (status, code, message, details) =>
  Object.assign(new Error(String(status)), { response: { status, data: { error: { code, message, details } } } });

const PROPERTY = {
  id: 'p1',
  displayName: '래미안 101동 101호',
  complex: { id: 'cx1', name: '래미안', roadAddress: '서울시 강남구 테헤란로 12' },
  buildingNo: '101',
  unitNo: '101',
  exclusiveArea: 84.92,
  floor: 10,
  status: 'VACANT',
  myRelation: { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' },
  createdAt: '2026-09-02T01:00:00.000Z',
};
const OWNERSHIP = {
  id: 'o1',
  isActive: true,
  verificationStatus: 'VERIFIED',
  verifiedAt: '2026-09-05T01:00:00.000Z',
  verificationExpiresAt: '2027-09-05T01:00:00.000Z',
  startedAt: '2026-09-02T01:00:00.000Z',
  endedAt: null,
  acquiredYearMonth: '2019-03',
  purchasePrice: 850000000,
  unitType: 'THREE_ROOM',
  equipment: ['AIR_CONDITIONER', 'REFRIGERATOR'],
  equipmentEtc: null,
};

const renderDetail = (onUnauthorized = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={['/landlord/properties/p1']}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={onUnauthorized} />} />
      </Routes>
    </MemoryRouter>,
  );

const card = (name) => screen.findByRole('region', { name });
const openSheet = async (cardName) => {
  await userEvent.click(within(await card(cardName)).getByRole('button', { name: `${cardName} 수정` }));
  return screen.getByRole('dialog', { name: `${cardName} 수정` });
};
const rowValue = (region, label) => within(region).getByText(label).nextElementSibling.textContent;

beforeEach(() => {
  Object.values(api).filter((fn) => typeof fn === 'function').forEach((fn) => fn.mockReset());
  api.getProperty.mockResolvedValue(PROPERTY);
  api.getComplex.mockResolvedValue({ id: 'cx1', roadAddress: '서울시 강남구 테헤란로 12', region: { fullName: '서울특별시 강남구 역삼동' } });
  api.getPropertyOwnership.mockResolvedValue(OWNERSHIP);
  api.getLatestOwnershipVerification.mockResolvedValue(null);
  api.getContractList.mockResolvedValue(page([]));
  api.getManagementLogList.mockResolvedValue(page([]));
  api.getPropertyDocumentBox.mockResolvedValue({ ownership: [], contracts: [] });
  api.patchPropertyOwnership.mockImplementation(async (id, body) => ({ ...OWNERSHIP, ...body }));
  api.patchProperty.mockImplementation(async (id, body) => ({ ...PROPERTY, ...body }));
});

describe('앱 부동산 상세: 호실 정보 카드', () => {
  it('주소·법정동·동호·면적·층·등록일을 보여 주고, 층이 없으면 그 줄을 두지 않는다', async () => {
    const { unmount } = renderDetail();
    const region = await card('호실 정보');
    expect(await within(region).findByText('서울특별시 강남구 역삼동')).toBeInTheDocument();
    expect(rowValue(region, '전용면적')).toBe('84.92m²');
    expect(rowValue(region, '층')).toBe('10층');
    expect(rowValue(region, '등록일')).toBe('2026-09-02');
    unmount();
    api.getProperty.mockResolvedValue({ ...PROPERTY, floor: null });
    renderDetail();
    expect(within(await card('호실 정보')).queryByText('층')).not.toBeInTheDocument();
  });

  it('면적·층을 웹과 같은 본문으로 저장하고(지하 B1 → -1), 시트를 닫고 호실을 다시 읽는다', async () => {
    renderDetail();
    const sheet = await openSheet('호실 정보');
    const area = within(sheet).getByLabelText('전용면적');
    await userEvent.clear(area);
    await userEvent.type(area, '59.9a');
    expect(area).toHaveValue('59.9');
    const floor = within(sheet).getByLabelText('층');
    expect(floor).toHaveValue('10');
    await userEvent.clear(floor);
    await userEvent.type(floor, 'b1');
    const readsBefore = api.getProperty.mock.calls.length;
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.patchProperty).toHaveBeenCalledWith('p1', { exclusiveArea: 59.9, floor: -1 });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '호실 정보 수정' })).not.toBeInTheDocument());
    expect(api.getProperty.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('지하 층은 B1로 시작 값을 채운다', async () => {
    api.getProperty.mockResolvedValue({ ...PROPERTY, floor: -2 });
    renderDetail();
    expect(rowValue(await card('호실 정보'), '층')).toBe('B2');
    const sheet = await openSheet('호실 정보');
    expect(within(sheet).getByLabelText('층')).toHaveValue('B2');
  });

  it('층·면적 형식이 틀리면 칸 아래 오류이고 저장할 수 없다', async () => {
    renderDetail();
    const sheet = await openSheet('호실 정보');
    const floor = within(sheet).getByLabelText('층');
    await userEvent.clear(floor);
    await userEvent.type(floor, '300');
    expect(within(sheet).getByText('숫자로 입력해 주세요. 지하는 B1처럼 적어요(B10~200층).')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '저장' })).toBeDisabled();
    await userEvent.clear(floor);
    const area = within(sheet).getByLabelText('전용면적');
    await userEvent.clear(area);
    await userEvent.type(area, '84.925');
    expect(within(sheet).getByText('0보다 큰 숫자로, 소수 둘째 자리까지 입력해 주세요.')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('비우고 저장하면 null 을 보낸다', async () => {
    renderDetail();
    const sheet = await openSheet('호실 정보');
    await userEvent.clear(within(sheet).getByLabelText('전용면적'));
    await userEvent.clear(within(sheet).getByLabelText('층'));
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.patchProperty).toHaveBeenCalledWith('p1', { exclusiveArea: null, floor: null });
  });

  it('서버 칸 오류(400)는 칸 아래, 403은 시트 안 안내', async () => {
    api.patchProperty.mockRejectedValueOnce(
      apiError(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', [{ field: 'floor', reason: '층을 다시 확인해 주세요.' }]),
    );
    api.patchProperty.mockRejectedValueOnce(apiError(403, 'FORBIDDEN', '권리자 인증을 마친 소유자만 수정할 수 있습니다.'));
    renderDetail();
    const sheet = await openSheet('호실 정보');
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(await within(sheet).findByText('층을 다시 확인해 주세요.')).toBeInTheDocument();
    expect(within(sheet).queryByText('입력값을 확인해 주세요.')).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(await within(sheet).findByText('권리자 인증을 마친 소유자만 수정할 수 있습니다.')).toBeInTheDocument();
  });

  it('[취소]는 요청하지 않고 닫는다', async () => {
    renderDetail();
    const sheet = await openSheet('호실 정보');
    await userEvent.click(within(sheet).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '호실 정보 수정' })).not.toBeInTheDocument();
    expect(api.patchProperty).not.toHaveBeenCalled();
  });

  it('인증 전인 지금 소유자는 [수정] 대신 인증 후 수정 안내', async () => {
    api.getProperty.mockResolvedValue({ ...PROPERTY, myRelation: { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'UNVERIFIED' } });
    api.getPropertyOwnership.mockResolvedValue({ ...OWNERSHIP, verificationStatus: 'UNVERIFIED', verifiedAt: null, verificationExpiresAt: null });
    renderDetail();
    const region = await card('호실 정보');
    expect(within(region).getByText('면적·층은 권리자 인증 후 수정할 수 있습니다')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: '호실 정보 수정' })).not.toBeInTheDocument();
  });

  it('예전 소유 호실은 [수정]도 안내도 없다', async () => {
    api.getProperty.mockResolvedValue({ ...PROPERTY, myRelation: { type: 'FORMER_OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' } });
    api.getPropertyOwnership.mockResolvedValue({ ...OWNERSHIP, isActive: false, endedAt: '2026-11-20T01:00:00.000Z' });
    renderDetail();
    const region = await card('호실 정보');
    expect(within(region).queryByRole('button', { name: '호실 정보 수정' })).not.toBeInTheDocument();
    expect(within(region).queryByText(/권리자 인증 후 수정/)).not.toBeInTheDocument();
  });
});

describe('앱 부동산 상세: 임대 조건 카드', () => {
  it('방 구성·설비를 보여 준다', async () => {
    renderDetail();
    const region = await card('임대 조건');
    expect(rowValue(region, '방 구성')).toBe('쓰리룸');
    expect(rowValue(region, '설비')).toBe('에어컨, 냉장고');
  });

  it('시트에서 고친 값을 웹과 같은 본문으로 저장하고, 시트를 닫고 다시 읽는다', async () => {
    renderDetail();
    const sheet = await openSheet('임대 조건');
    await userEvent.selectOptions(within(sheet).getByLabelText('방 구성'), 'TWO_ROOM');
    await userEvent.click(within(sheet).getByLabelText('냉장고'));
    await userEvent.click(within(sheet).getByLabelText('세탁기'));
    await userEvent.type(within(sheet).getByLabelText('기타 설비'), '  커튼 ');
    const readsBefore = api.getPropertyOwnership.mock.calls.length;
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.patchPropertyOwnership).toHaveBeenCalledWith('o1', {
      unitType: 'TWO_ROOM',
      equipment: ['AIR_CONDITIONER', 'WASHING_MACHINE'],
      equipmentEtc: '커튼',
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '임대 조건 수정' })).not.toBeInTheDocument());
    expect(api.getPropertyOwnership.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('비어 있으면 점선 버튼으로 시트를 연다. 모두 비우고 저장하면 null 을 보낸다', async () => {
    api.getPropertyOwnership.mockResolvedValue({ ...OWNERSHIP, unitType: null, equipment: [], equipmentEtc: null });
    renderDetail();
    const region = await card('임대 조건');
    await userEvent.click(within(region).getByRole('button', { name: /방 구성·설비를 넣으면 계약할 때 편해요/ }));
    const sheet = screen.getByRole('dialog', { name: '임대 조건 수정' });
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.patchPropertyOwnership).toHaveBeenCalledWith('o1', { unitType: null, equipment: [], equipmentEtc: null });
  });

  it('[취소]는 요청하지 않고 닫는다', async () => {
    renderDetail();
    const sheet = await openSheet('임대 조건');
    await userEvent.click(within(sheet).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '임대 조건 수정' })).not.toBeInTheDocument();
    expect(api.patchPropertyOwnership).not.toHaveBeenCalled();
  });

  it('서버 오류 message 를 시트 안에 보여 주고 닫지 않는다', async () => {
    api.patchPropertyOwnership.mockRejectedValue(apiError(403, 'FORBIDDEN', '권한이 없습니다.'));
    renderDetail();
    const sheet = await openSheet('임대 조건');
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(await within(sheet).findByText('권한이 없습니다.')).toBeInTheDocument();
  });
});

describe('앱 부동산 상세: 내 소유 정보 카드', () => {
  it('취득 연월·매입가·인증일·인증 만료일·소유 시작을 보여 준다', async () => {
    renderDetail();
    const region = await card('내 소유 정보');
    expect(rowValue(region, '취득 연월')).toBe('2019-03');
    expect(rowValue(region, '매입가')).toBe('850,000,000원');
    expect(rowValue(region, '인증일')).toBe('2026-09-05');
    expect(rowValue(region, '인증 만료일')).toBe('2027-09-05');
    expect(rowValue(region, '소유 시작')).toBe('2026-09-02');
    expect(within(region).queryByText('소유 종료')).not.toBeInTheDocument();
  });

  it('매입가는 콤마를 붙여 보여 주고 숫자로 보낸다', async () => {
    renderDetail();
    const sheet = await openSheet('내 소유 정보');
    const price = within(sheet).getByLabelText('매입가');
    await userEvent.clear(price);
    await userEvent.type(price, '0912000000');
    expect(price).toHaveValue('912,000,000');
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.patchPropertyOwnership).toHaveBeenCalledWith('o1', { acquiredYearMonth: '2019-03', purchasePrice: 912000000 });
  });

  it('취득 연월 형식이 틀리면 칸 아래 오류이고 저장할 수 없다', async () => {
    renderDetail();
    const sheet = await openSheet('내 소유 정보');
    const ym = within(sheet).getByLabelText('취득 연월');
    await userEvent.clear(ym);
    await userEvent.type(ym, '2019');
    expect(within(sheet).getByText('YYYY-MM 형식으로 입력해 주세요. 예: 2019-03')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('비우고 저장하면 null 을 보낸다', async () => {
    renderDetail();
    const sheet = await openSheet('내 소유 정보');
    await userEvent.clear(within(sheet).getByLabelText('취득 연월'));
    await userEvent.clear(within(sheet).getByLabelText('매입가'));
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(api.patchPropertyOwnership).toHaveBeenCalledWith('o1', { acquiredYearMonth: null, purchasePrice: null });
  });

  it('서버 칸 오류(400)는 그 칸 아래에 붙인다', async () => {
    api.patchPropertyOwnership.mockRejectedValue(
      apiError(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', [{ field: 'purchasePrice', reason: '매입가가 너무 커요.' }]),
    );
    renderDetail();
    const sheet = await openSheet('내 소유 정보');
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(await within(sheet).findByText('매입가가 너무 커요.')).toBeInTheDocument();
    expect(within(sheet).queryByText('입력값을 확인해 주세요.')).not.toBeInTheDocument();
  });

  it('401이면 onUnauthorized', async () => {
    api.patchPropertyOwnership.mockRejectedValue(apiError(401, 'AUTH_REQUIRED', '로그인'));
    const onUnauthorized = vi.fn();
    renderDetail(onUnauthorized);
    const sheet = await openSheet('내 소유 정보');
    await userEvent.click(within(sheet).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});

describe('앱 부동산 상세: 예전 소유 호실', () => {
  beforeEach(() => {
    api.getProperty.mockResolvedValue({ ...PROPERTY, myRelation: { type: 'FORMER_OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' } });
    api.getPropertyOwnership.mockResolvedValue({ ...OWNERSHIP, isActive: false, endedAt: '2026-11-20T01:00:00.000Z' });
  });

  it('두 카드를 [수정] 없이 보여 주고, 소유 종료 날짜를 더한다', async () => {
    renderDetail();
    const owner = await card('내 소유 정보');
    expect(rowValue(owner, '소유 종료')).toBe('2026-11-20');
    expect(within(owner).queryByRole('button', { name: '내 소유 정보 수정' })).not.toBeInTheDocument();
    expect(within(await card('임대 조건')).queryByRole('button', { name: '임대 조건 수정' })).not.toBeInTheDocument();
    expect(api.getPropertyOwnership).toHaveBeenCalledWith('o1');
  });

  it('빈 임대 조건은 입력 권유 대신 안내 문구', async () => {
    api.getPropertyOwnership.mockResolvedValue({ ...OWNERSHIP, isActive: false, unitType: null, equipment: [], equipmentEtc: null });
    renderDetail();
    expect(await within(await card('임대 조건')).findByText('입력한 방 구성·설비가 없어요.')).toBeInTheDocument();
  });

  it('권리자 인증 진행 상태·건축물대장 대조 카드는 보이지 않는다', async () => {
    renderDetail();
    await card('내 소유 정보');
    expect(api.getLatestOwnershipVerification).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '건축물대장 대조 완료' })).not.toBeInTheDocument();
  });
});
