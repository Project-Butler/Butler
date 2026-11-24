// 임대인 앱 M05 내 자산 · M06 부동산 상세 · M07 계약 관리 · M08 하우스 로그. 웹과 같은 API로 Figma 배치대로 보이는지 본다.
// 실패 조건: 공실에 보증금 · API에 없는 반려 칩/문서가 실제처럼 보임 · 버튼이 엉뚱한 주소로 감 · 401에 onUnauthorized 를 안 부름
// · 하우스 로그에 수정·삭제 동작이 생김 · [갱신 의사 묻기]가 눌림.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getContractList: vi.fn(),
  getPropertyList: vi.fn(),
  getPropertyOwnershipList: vi.fn(),
  getProperty: vi.fn(),
  getComplex: vi.fn(),
  getContract: vi.fn(),
  getManagementLogList: vi.fn(),
  getLatestOwnershipVerification: vi.fn(),
  getPropertyOwnership: vi.fn(),
  postThread: vi.fn(),
  getThreadList: vi.fn(),
  getPropertyDocumentBox: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', email: 'landlord@butler.test', role: 'LANDLORD' };
const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });
const unauthorized = () => Object.assign(new Error('401'), { response: { status: 401, data: { error: { code: 'AUTH_REQUIRED', message: '로그인' } } } });

const PROPERTY = {
  id: 'p1',
  displayName: '래미안 101동 101호',
  complex: { id: 'cx1', name: '래미안', roadAddress: '서울시 강남구 테헤란로 12' },
  buildingNo: '101',
  unitNo: '101',
  exclusiveArea: 84.92,
  floor: 10,
  status: 'LEASED',
  myRelation: { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' },
  myListing: { unitType: 'THREE_ROOM' },
  createdAt: '2026-09-02T01:00:00.000Z',
};
const VACANT = {
  ...PROPERTY,
  id: 'p2',
  displayName: '래미안 101동 102호',
  unitNo: '102',
  status: 'VACANT',
  myRelation: { type: 'OWNER', ownershipId: 'o2', verificationStatus: 'UNVERIFIED' },
};
const CONTRACT = {
  id: 'c1',
  property: { id: 'p1', displayName: '래미안 101동 101호', buildingNo: '101', unitNo: '101' },
  tenantName: '김임차',
  tenant: { name: '김임차', userId: 'u-t', phone: null },
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 500000,
  rentPaymentDay: 25,
  startDate: '2024-10-28',
  endDate: '2026-10-27',
  status: 'EXPIRING_SOON',
  daysUntilEnd: 7,
  previousContractId: null,
  endReason: null,
  isReadOnly: false,
};
const LOG = (overrides) => ({
  id: 'l1',
  property: { id: 'p1', displayName: '래미안 101동 101호', buildingNo: '101', unitNo: '101' },
  type: 'REPAIR',
  scope: 'PRIVATE',
  title: '보일러 수리 완료',
  occurredOn: '2026-10-20',
  attachments: [{ id: 'd1' }],
  source: { feature: 'platform', resourceType: null, resourceId: null },
  ...overrides,
});

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (entry, onUnauthorized = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={onUnauthorized} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onUnauthorized };
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getPropertyList.mockImplementation(({ relation }) => Promise.resolve(page(relation === 'OWNER' ? [PROPERTY, VACANT] : [])));
  api.getContractList.mockResolvedValue(page([CONTRACT]));
  api.getProperty.mockResolvedValue(PROPERTY);
  api.getComplex.mockResolvedValue({
    id: 'cx1',
    roadAddress: '서울시 강남구 테헤란로 12',
    region: { fullName: '서울특별시 강남구 역삼동' },
    buildingInfo: { approvalDate: '2009-05-01' },
  });
  api.getContract.mockResolvedValue(CONTRACT);
  api.getManagementLogList.mockResolvedValue(page([LOG(), LOG({ id: 'l2', occurredOn: '2026-09-03', title: '누수 점검', type: 'INSPECTION', attachments: [], source: { resourceType: 'TICKET' } })]));
  api.getLatestOwnershipVerification.mockResolvedValue({ id: 'a1', ownershipId: 'o1', status: 'VERIFIED', createdAt: '2026-09-02T00:00:00.000Z', finishedAt: '2026-09-02T01:00:00.000Z' });
  api.getPropertyOwnership.mockResolvedValue({ id: 'o1', verificationStatus: 'VERIFIED', verifiedAt: '2026-09-05T01:00:00.000Z', verificationExpiresAt: '2027-09-05T01:00:00.000Z', isActive: true });
});

describe('M05 내 자산', () => {
  it('카드: 계약 중은 임차인·보증금, 공실은 보증금 없이, 미인증은 [인증하기]', async () => {
    renderAt('/landlord/buildings');
    const list = await screen.findByRole('list', { name: '부동산 목록' });
    const [leased, vacant] = within(list).getAllByRole('listitem');
    expect(within(leased).getByText('임차인 김임차 · 계약 중')).toBeInTheDocument();
    expect(within(leased).getByText('보증금 5,000만')).toBeInTheDocument();
    expect(within(leased).getByText('✓ 인증 완료')).toBeInTheDocument();
    expect(within(vacant).getByText('공실 · 임차인 없음')).toBeInTheDocument();
    expect(within(vacant).queryByText(/보증금/)).not.toBeInTheDocument();
    expect(within(vacant).getByText('미인증')).toBeInTheDocument();
    expect(screen.queryByText('반려')).not.toBeInTheDocument();

    await userEvent.click(within(vacant).getByRole('button', { name: '인증하기' }));
    expect(where()).toBe('/landlord/properties/p2/verify');
  });

  it('세그먼트·검색으로 거르고, 카드를 누르면 부동산 상세로 간다', async () => {
    renderAt('/landlord/buildings');
    const segments = await screen.findByRole('group', { name: '계약 상태' });
    await waitFor(() => expect(within(segments).getByRole('button', { name: /^전체s*2$/ })).toBeInTheDocument());
    await userEvent.click(within(segments).getByRole('button', { name: /^공실s*1$/ }));
    expect(within(screen.getByRole('list', { name: '부동산 목록' })).getAllByRole('listitem')).toHaveLength(1);

    await userEvent.click(within(segments).getByRole('button', { name: /^전체s*2$/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: '주소·단지명 검색' }), '없는 단지');
    expect(screen.getByText('조건에 맞는 부동산이 없어요')).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: '주소·단지명 검색' }));
    await userEvent.click(screen.getByText('래미안 101동 101호'));
    expect(where()).toBe('/landlord/properties/p1');
  });

  it('부동산이 없으면 안내와 [부동산 등록]', async () => {
    api.getPropertyList.mockResolvedValue(page([]));
    api.getContractList.mockResolvedValue(page([]));
    renderAt('/landlord/buildings');
    const empty = await screen.findByRole('region', { name: '부동산 없음' });
    await userEvent.click(within(empty).getByRole('button', { name: '부동산 등록' }));
    expect(where()).toBe('/landlord/properties/new');
  });

  it('오류는 안내로, 401은 onUnauthorized', async () => {
    api.getPropertyList.mockRejectedValue(unauthorized());
    const { onUnauthorized } = renderAt('/landlord/buildings');
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});

describe('M06 부동산 상세', () => {
  it('요약 카드: 칩·준공연도·보증금·월세·D-day(임박 빨강)', async () => {
    renderAt('/landlord/properties/p1');
    const summary = await screen.findByRole('region', { name: '요약' });
    expect(within(banner()).getByRole('heading', { name: '래미안 101동 101호' })).toBeInTheDocument();
    await waitFor(() => expect(within(summary).getByText('쓰리룸 · 전용 84.92m² · 2009년 준공')).toBeInTheDocument());
    expect(within(summary).getByText('✓ 인증 완료')).toBeInTheDocument();
    expect(within(summary).getByText('임대중')).toBeInTheDocument();
    expect(await within(summary).findByText('5,000만')).toBeInTheDocument();
    expect(within(summary).getByText('50만')).toBeInTheDocument();
    expect(within(summary).getByText('D-7')).toHaveClass('text-crit-ink');
  });

  it('[기본 정보]: 주소·법정동·동호·면적·등록일, 건축물대장 대조 카드는 소유 관계 인증일만, 등기 고유번호 없음', async () => {
    renderAt('/landlord/properties/p1');
    const panel = await screen.findByRole('tabpanel');
    // 법정동은 주소 바로 아래 줄이다
    const labels = await within(panel).findAllByRole('term');
    expect(labels.map((term) => term.textContent).slice(0, 3)).toEqual(['주소', '법정동', '동·호']);
    expect(await within(panel).findByText('서울특별시 강남구 역삼동')).toBeInTheDocument();
    expect(within(panel).getByText('101동 101호')).toBeInTheDocument();
    expect(within(panel).getByText('2026-09-02')).toBeInTheDocument();
    const sealed = await within(panel).findByRole('region', { name: '건축물대장 대조 완료' });
    expect(sealed).toHaveTextContent('인증 완료 · 2026-09-05');
    expect(sealed).not.toHaveTextContent('SHA-256');
    expect(screen.queryByText(/고유번호/)).not.toBeInTheDocument();
    expect(screen.queryByText(/등기부 대조/)).not.toBeInTheDocument();
  });

  it('[기본 정보] 인증 시도 기록 없이 인증된 호실(운영자 처리·시드)도 대조 카드를 보여 준다', async () => {
    api.getLatestOwnershipVerification.mockResolvedValue(null);
    renderAt('/landlord/properties/p1');
    const panel = await screen.findByRole('tabpanel');
    const sealed = await within(panel).findByRole('region', { name: '건축물대장 대조 완료' });
    expect(sealed).toHaveTextContent('인증 완료 · 2026-09-05');
  });

  it('[기본 정보]의 임차인 대화 버튼은 지금 계약으로 대화를 연다', async () => {
    api.postThread.mockResolvedValue({ id: 'th1' });
    renderAt('/landlord/properties/p1');
    await userEvent.click(await screen.findByRole('button', { name: '김임차님과 대화' }));
    expect(api.postThread).toHaveBeenCalledWith({ contextType: 'CONTRACT', contextId: 'c1' });
    expect(where()).toBe('/landlord/threads/th1');
  });

  it('[기본 정보] 지금 계약에 임차인 계정이 연결되지 않았으면 대화 버튼이 없다', async () => {
    api.getContractList.mockResolvedValue(page([{ ...CONTRACT, tenant: { ...CONTRACT.tenant, userId: null } }]));
    renderAt('/landlord/properties/p1');
    const summary = await screen.findByRole('region', { name: '요약' });
    await within(summary).findByText('5,000만');
    expect(screen.queryByRole('button', { name: /님과 대화/ })).not.toBeInTheDocument();
  });

  it('[계약] 탭의 계약을 누르면 계약 관리로 간다', async () => {
    renderAt('/landlord/properties/p1');
    await userEvent.click(await screen.findByRole('tab', { name: '계약' }));
    await userEvent.click(await screen.findByRole('button', { name: /김임차/ }));
    expect(where()).toBe('/landlord/contracts/c1');
  });

  it('[문서]는 최근 문서와 [문서함 열기]로 그 호실 문서함에 간다', async () => {
    api.getPropertyDocumentBox.mockResolvedValue({
      property: { id: 'p1', displayName: '래미안 101동 101호' },
      documentCount: 1,
      ownerships: [{ id: 'o1', isActive: true, isUploadable: true, documents: [{ id: 'd1', fileName: '등기부.pdf', documentType: 'REGISTRY_CERTIFICATE', mimeType: 'application/pdf', sizeBytes: 1000, createdAt: '2026-10-01T00:00:00.000Z' }] }],
      contracts: [],
    });
    renderAt('/landlord/properties/p1');
    await userEvent.click(await screen.findByRole('tab', { name: '문서' }));
    const recent = await screen.findByRole('list', { name: '최근 문서' });
    expect(within(recent).getByText('등기부.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '문서함 열기 1' }));
    expect(where()).toBe('/landlord/documents?propertyId=p1');
  });

  it('[하우스 로그] 전체 보기는 호실 필터로 간다', async () => {
    renderAt('/landlord/properties/p1');
    await userEvent.click(await screen.findByRole('tab', { name: '하우스 로그' }));
    await userEvent.click(await screen.findByRole('button', { name: '전체 보기' }));
    expect(where()).toBe('/landlord/logs?propertyId=p1');
  });

  it('⋯ 메뉴는 이동형 동작만', async () => {
    renderAt('/landlord/properties/p1');
    await userEvent.click(await within(banner()).findByRole('button', { name: '더보기' }));
    const menu = screen.getByRole('menu', { name: '더보기' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['하우스 로그 기록 추가', '수리·점검']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: '하우스 로그 기록 추가' }));
    expect(where()).toBe('/landlord/properties/p1/logs/new');
  });

  it('없는 호실이면 오류 안내', async () => {
    api.getProperty.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404, data: { error: { code: 'PROPERTY_NOT_FOUND', message: '호실을 찾을 수 없습니다.' } } } }));
    renderAt('/landlord/properties/p9');
    expect(await screen.findByText('호실을 찾을 수 없습니다.')).toBeInTheDocument();
  });
});

describe('M07 계약 관리', () => {
  it('현재 계약 행과 D-day, 갱신 진행·첨부 문서는 준비 중, [갱신 의사 묻기]는 비활성', async () => {
    renderAt('/landlord/contracts/c1');
    const card = await screen.findByRole('region', { name: '현재 계약' });
    expect(within(banner()).getByRole('heading', { name: '계약 · 101동 101호' })).toBeInTheDocument();
    expect(within(card).getByText('D-7')).toBeInTheDocument();
    expect(within(card).getByText('김임차 · 초대 수락')).toBeInTheDocument();
    expect(within(card).getByText('50,000,000원')).toBeInTheDocument();
    expect(within(card).getByText('500,000원 · 매월 25일')).toBeInTheDocument();
    expect(within(card).getByText('월세 · 갱신 1회 남음')).toBeInTheDocument();
    // 임차인 대화는 부동산 상세 [기본 정보]에서만 연다
    expect(screen.queryByRole('button', { name: /님과 대화/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '갱신 진행' })).getByText('준비 중')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '첨부 문서' })).getByText('준비 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /갱신 의사 묻기/ })).toBeDisabled();
    expect(screen.queryByRole('navigation', { name: '하단 메뉴' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '계약 수정' }));
    expect(where()).toBe('/landlord/contracts/c1/edit');
  });

  it('끝난(읽기 전용) 계약은 [계약 수정]이 비활성', async () => {
    api.getContract.mockResolvedValueOnce({ ...CONTRACT, isReadOnly: true });
    renderAt('/landlord/contracts/c1');
    expect(await screen.findByRole('button', { name: '계약 수정' })).toBeDisabled();
  });

  it('끝난 계약은 이미 있는 대화방을 [지난 대화 보기]로 연다(새로 만들지 않는다)', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, status: 'EXPIRED', isReadOnly: true });
    api.getThreadList.mockResolvedValue(page([{ id: 'th-old' }]));
    renderAt('/landlord/contracts/c1');
    await userEvent.click(await screen.findByRole('button', { name: '김임차님과의 대화 보기' }));
    expect(api.getThreadList).toHaveBeenCalledWith({ contextType: 'CONTRACT', contextId: 'c1', size: 1 });
    expect(api.postThread).not.toHaveBeenCalled();
    expect(where()).toBe('/landlord/threads/th-old');
  });

  it('끝난 계약에 대화방이 없으면 버튼이 없다', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, status: 'TERMINATED', isReadOnly: true });
    api.getThreadList.mockResolvedValue(page([]));
    renderAt('/landlord/contracts/c1');
    await screen.findByRole('region', { name: '지난 계약' });
    await waitFor(() => expect(api.getThreadList).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /대화/ })).not.toBeInTheDocument();
  });

  it('끝난 계약은 지난 계약: 갱신 진행·[갱신 의사 묻기]·갱신 안내가 없다', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, status: 'EXPIRED', daysUntilEnd: null, isReadOnly: true });
    api.getThreadList.mockResolvedValue(page([]));
    renderAt('/landlord/contracts/c1');
    const card = await screen.findByRole('region', { name: '지난 계약' });
    expect(within(card).getByText('만료')).toBeInTheDocument();
    expect(within(card).queryByText(/갱신 \d회 남음/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '현재 계약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '갱신 진행' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /갱신 의사 묻기/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/계약갱신청구권/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계약 수정' })).toBeDisabled();
  });

  it('진행 중 계약은 지난 대화방을 찾지 않는다', async () => {
    renderAt('/landlord/contracts/c1');
    await screen.findByRole('region', { name: '현재 계약' });
    expect(api.getThreadList).not.toHaveBeenCalled();
  });

  it('401이면 onUnauthorized', async () => {
    api.getContract.mockRejectedValue(unauthorized());
    const { onUnauthorized } = renderAt('/landlord/contracts/c1');
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});

describe('M08 하우스 로그', () => {
  it('월별로 묶고, 수정·삭제 안내만 있고 동작은 없다. 행을 누르면 기록 상세', async () => {
    renderAt('/landlord/logs');
    const october = await screen.findByRole('region', { name: '2026년 10월' });
    expect(within(october).getByText('101동 101호')).toBeInTheDocument();
    expect(within(october).getByText(/보일러 수리 완료/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '2026년 9월' })).getByText(/수리 요청/)).toBeInTheDocument();
    expect(screen.getByText(/하우스 로그는 수정·삭제할 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /삭제|수정/ })).not.toBeInTheDocument();

    await userEvent.click(within(october).getByRole('button'));
    expect(where()).toBe('/landlord/logs/l1');
  });

  it('유형 칩은 현재 type 그대로, 고르면 그 type 으로 다시 부른다', async () => {
    renderAt('/landlord/logs');
    const chips = await screen.findByRole('group', { name: '유형' });
    expect(within(chips).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['전체', '수리', '점검', '메모', '수리 요청 완료']);
    await userEvent.click(within(chips).getByRole('button', { name: '점검' }));
    await waitFor(() => expect(api.getManagementLogList).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INSPECTION' })));
  });

  it('방 칩은 전체 + 9가지 + 방 없음, 여러 개 고르면 쉼표로, 전체를 누르면 풀린다', async () => {
    renderAt('/landlord/logs');
    const chips = await screen.findByRole('group', { name: '방' });
    expect(within(chips).getAllByRole('button').map((chip) => chip.textContent)).toEqual([
      '전체', '현관', '거실', '주방', '욕실·화장실', '침실', '다용도실', '베란다', '보일러실', '기타', '방 없음',
    ]);
    expect(within(chips).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(chips).getByRole('button', { name: '방 없음' }));
    await userEvent.click(within(chips).getByRole('button', { name: '주방' }));
    expect(within(chips).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(api.getManagementLogList).toHaveBeenLastCalledWith(expect.objectContaining({ room: 'KITCHEN,NONE' })));
    await userEvent.click(within(chips).getByRole('button', { name: '전체' }));
    await waitFor(() => expect(api.getManagementLogList).toHaveBeenLastCalledWith(expect.objectContaining({ room: undefined })));
  });

  it('기록 줄에 방을 보여 준다', async () => {
    api.getManagementLogList.mockResolvedValue(page([LOG({ room: 'BOILER_ROOM' })]));
    renderAt('/landlord/logs');
    const october = await screen.findByRole('region', { name: '2026년 10월' });
    expect(within(october).getByText(/보일러실/)).toBeInTheDocument();
  });

  it('필터 아이콘으로 호실을 고르면 주소에 남긴다', async () => {
    renderAt('/landlord/logs');
    await userEvent.click(await within(banner()).findByRole('button', { name: '호실 선택' }));
    const dialog = screen.getByRole('dialog', { name: '호실 선택' });
    await userEvent.click(await within(dialog).findByRole('button', { name: '래미안 101동 102호' }));
    expect(where()).toBe('/landlord/logs?propertyId=p2');
    await waitFor(() => expect(api.getManagementLogList).toHaveBeenLastCalledWith(expect.objectContaining({ propertyId: 'p2' })));
  });

  it('기록이 없으면 빈 안내', async () => {
    api.getManagementLogList.mockResolvedValue(page([]));
    renderAt('/landlord/logs');
    expect(await screen.findByText('아직 하우스 로그가 없어요')).toBeInTheDocument();
  });
});

function banner() {
  return screen.getByRole('banner');
}
