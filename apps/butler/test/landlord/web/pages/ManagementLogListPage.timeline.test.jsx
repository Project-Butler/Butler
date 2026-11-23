// 하우스 로그 PC 화면 2단계(#203 P-4b): 거르기 → 타임라인 → 할 일 → 표, 전체 호실, 매도 호실.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  getPropertyList: vi.fn(),
  getPropertyOwnershipList: vi.fn(),
  getContractList: vi.fn(),
  getRenewalNoticeList: vi.fn(),
  getManagementLogList: vi.fn(),
  getManagementLog: vi.fn(),
  getTicketList: vi.fn(),
  getUploadRules: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  postOwnershipRemove: vi.fn(),
  deleteManagementLog: vi.fn(),
}));

import {
  getContractList,
  getManagementLog,
  getManagementLogList,
  getPropertyList,
  getPropertyOwnershipList,
  getRenewalNoticeList,
} from '@butler/api-client';
import { ManagementLogListPage } from '../../../../src/landlord/web/pages/ManagementLogListPage';

const home = (id, complexName, unitNo) => ({
  id,
  complex: { id: `c-${id}`, name: complexName, roadAddress: `${complexName} 도로명 1` },
  buildingNo: '101',
  unitNo,
  displayName: `${complexName} 101동 ${unitNo}호`,
  myRelation: { verificationStatus: 'VERIFIED' },
});
const HOME_A = home('p1', '하늘숲아파트', '1203');
const HOME_B = home('p2', '푸른마을', '702');

const log = (overrides) => ({
  id: 'log-1',
  propertyId: 'p1',
  property: HOME_A,
  type: 'REPAIR',
  scope: 'PROPERTY_HISTORY',
  room: 'KITCHEN',
  title: '주방 수전 교체',
  content: '카트리지 교체',
  occurredOn: '2026-11-21',
  cost: 180000,
  attachments: [],
  author: { id: 'me' },
  source: null,
  isReadOnly: false,
  isFromPreviousOwner: false,
  ...overrides,
});
const page = (items) => ({ data: items, meta: { page: 1, size: 20, total: items.length, hasNext: false } });

const OWN_A = { id: 'o1', property: { id: 'p1' }, verifiedAt: null, endedAt: null, endReason: null };
const OWN_B = { id: 'o2', property: { id: 'p2' }, verifiedAt: null, endedAt: null, endReason: null };
const CONTRACT_A = {
  id: 'c1',
  ownershipId: 'o1',
  property: HOME_A,
  startDate: '2025-03-01',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  terminatedOn: null,
  previousContractId: null,
  tenantName: '김임차',
  createdAt: '2025-02-20T01:00:00.000Z',
  renewalNotice: {
    windowStart: '2026-08-28',
    deadline: '2026-12-28',
    safeDeadline: '2026-12-27',
    phase: 'CLOSING_SOON',
    daysUntilDeadline: 34,
    hasDeliveredInTime: false,
    latestNotice: null,
  },
};

const renderPage = (props = {}) => {
  const handlers = { onNavigate: vi.fn(), onOpenModal: vi.fn(), onCloseModal: vi.fn() };
  render(<ManagementLogListPage modal={null} {...handlers} {...props} />);
  return handlers;
};

// 불러오는 동안 같은 이름의 자리 카드가 먼저 보이므로 축이 그려진 뒤의 카드를 고른다.
const findTimeline = async () => {
  await screen.findByTestId('timeline-axis', {}, { timeout: 3000 });
  return screen.getByRole('region', { name: '계약 타임라인' });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T03:00:00.000Z'));
  vi.mocked(getPropertyList).mockImplementation(async ({ relation }) => page(relation === 'OWNER' ? [HOME_A, HOME_B] : []));
  vi.mocked(getManagementLogList).mockReset();
  vi.mocked(getManagementLogList).mockResolvedValue(
    page([log(), log({ id: 'log-2', room: null, title: '관리비 확인', type: 'NOTE', cost: null, occurredOn: '2026-06-02' })]),
  );
  vi.mocked(getPropertyOwnershipList).mockResolvedValue(page([OWN_A, OWN_B]));
  vi.mocked(getContractList).mockResolvedValue(page([CONTRACT_A]));
  vi.mocked(getRenewalNoticeList).mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('한 호실 (H-22)', () => {
  it('거르기 → 타임라인 → 할 일 → 표 순서, 기록은 축 시작부터 100건씩 읽는다', async () => {
    renderPage({ propertyId: 'p1' });
    const timeline = await findTimeline();
    await within(timeline).findByRole('button', { name: '2026-11-21 수리 주방 수전 교체' }, { timeout: 3000 });
    const filter = screen.getByRole('region', { name: '기록 찾기' });
    const todo = screen.getByRole('region', { name: '앞으로 할 일' });
    const table = await screen.findByRole('table');
    expect(filter.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeline.compareDocumentPosition(todo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(todo.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getManagementLogList).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'p1', from: '2025-03-01', size: 100, page: 1 }));
    expect(getContractList).toHaveBeenCalledWith(expect.objectContaining({ includeEndedOwnership: true }));
    expect(getRenewalNoticeList).toHaveBeenCalledWith('c1');
    expect(within(todo).getByText('갱신 거절 통지 권장 마감 · 2026-12-27')).toBeInTheDocument();
  });

  it('[통지 기록하기]·계약 점 [계약 보기]는 호실 상세 계약 칸으로 간다(H-38)', async () => {
    const { onNavigate } = renderPage({ propertyId: 'p1' });
    await findTimeline();
    const todo = await screen.findByRole('region', { name: '앞으로 할 일' });
    await userEvent.click(within(todo).getByRole('button', { name: /통지 기록하기/ }));
    expect(onNavigate).toHaveBeenCalledWith('propertyDetail', { propertyId: 'p1', contractId: 'c1' });

    await userEvent.click(screen.getByRole('button', { name: '2025-03-01 계약·통지 계약 시작' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /계약 보기/ }));
    expect(onNavigate).toHaveBeenLastCalledWith('propertyDetail', { propertyId: 'p1', contractId: 'c1' });
  });

  it('유형 거르기는 기록 점만 줄이고 계약 점은 남긴다', async () => {
    renderPage({ propertyId: 'p1' });
    const timeline = await findTimeline();
    await within(timeline).findByRole('button', { name: /2026-06-02 메모/ });
    await userEvent.click(within(screen.getByRole('group', { name: '유형' })).getByRole('checkbox', { name: '수리' }));
    expect(within(timeline).queryByRole('button', { name: /2026-06-02 메모/ })).not.toBeInTheDocument();
    expect(within(timeline).getByRole('button', { name: '2026-11-21 수리 주방 수전 교체' })).toBeInTheDocument();
    expect(within(timeline).getByRole('button', { name: '2025-03-01 계약·통지 계약 시작' })).toBeInTheDocument();
  });

  it('계약이 없으면 회색 빈 상태 + [계약 등록], 할 일 카드는 숨긴다(H-39)', async () => {
    vi.mocked(getContractList).mockResolvedValue(page([]));
    const { onNavigate } = renderPage({ propertyId: 'p1' });
    const timeline = await findTimeline();
    await within(timeline).findByText('진행 중인 계약이 없어요');
    expect(screen.queryByRole('region', { name: '앞으로 할 일' })).not.toBeInTheDocument();
    await userEvent.click(within(timeline).getByRole('button', { name: /계약 등록/ }));
    expect(onNavigate).toHaveBeenCalledWith('propertyDetail', { propertyId: 'p1' });
  });

  it('작은 카드 [상세 보기]는 카드를 닫고 그 기록을 오른쪽 상세 패널에 연다', async () => {
    vi.mocked(getManagementLog).mockResolvedValue({ ...log(), isDeletable: true });
    renderPage({ propertyId: 'p1' });
    await userEvent.click(await screen.findByRole('button', { name: '2026-11-21 수리 주방 수전 교체' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /상세 보기/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getManagementLog).toHaveBeenCalledWith('log-1'));
  });

  it('이전 소유 띠(H-30): 인증 호실은 소유 시작 전날까지의 호실 이력을 끝까지 읽어 넘겨받은 기록만 센다', async () => {
    vi.mocked(getPropertyOwnershipList).mockResolvedValue(page([{ ...OWN_A, verifiedAt: '2026-09-01T01:00:00.000Z' }]));
    vi.mocked(getContractList).mockResolvedValue(page([{ ...CONTRACT_A, startDate: '2026-10-01', endDate: '2028-09-30' }]));
    vi.mocked(getManagementLogList).mockImplementation(async (params) =>
      params.scope === 'PROPERTY_HISTORY'
        ? page([
            log({ id: 'prev-1', occurredOn: '2025-03-18', isFromPreviousOwner: true, title: '욕실 환풍기 교체' }),
            log({ id: 'prev-2', occurredOn: '2026-05-20', isFromPreviousOwner: true }),
            log({ id: 'mine', occurredOn: '2026-08-01', isFromPreviousOwner: false }),
          ])
        : page([]),
    );
    renderPage({ propertyId: 'p1' });
    const timeline = await findTimeline();
    await within(timeline).findByTestId('owner-band');
    expect(getManagementLogList).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'p1', scope: 'PROPERTY_HISTORY', until: '2026-08-31' }));
    expect(timeline).toHaveTextContent('이전 소유 기간집 이력 2건');
    await userEvent.click(within(timeline).getByRole('button', { name: '2025-03-18 수리 욕실 환풍기 교체' }));
    expect(within(screen.getByRole('dialog')).getByText('이전 소유자 기록 · 읽기 전용')).toBeInTheDocument();
  });

  it('소유가 끝난(매도) 호실: 안내 띠와 넘어간 이력 칩, 할 일 없음', async () => {
    vi.mocked(getPropertyOwnershipList).mockResolvedValue(
      page([{ ...OWN_A, endedAt: '2026-10-31T03:00:00.000Z', endReason: 'SOLD', verifiedAt: '2025-01-01T00:00:00.000Z' }]),
    );
    vi.mocked(getManagementLogList).mockResolvedValue(page([log({ isHideOnly: true, isDeletable: true })]));
    renderPage({ propertyId: 'p1' });
    const banner = await screen.findByRole('region', { name: '소유가 끝난 호실' });
    expect(within(banner).getByText('2026-10-31에 매도한 호실이에요')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: /목록에서 지우기/ })).toBeInTheDocument();
    expect(await within(await screen.findByRole('table')).findByText('넘어간 이력')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '앞으로 할 일' })).not.toBeInTheDocument();
  });
});

describe('전체 호실 (H-28)', () => {
  it('같은 달력에 호실별 줄(통지 마감 가까운 순), 이름을 누르면 그 호실로', async () => {
    const { onNavigate } = renderPage({ showAll: true });
    const all = await screen.findByRole('region', { name: '전체 호실 계약 타임라인' });
    await waitFor(() => expect(within(all).getAllByTestId('home-lane')).toHaveLength(2));
    const lanes = within(all).getAllByTestId('home-lane');
    expect(lanes[0]).toHaveTextContent('하늘숲아파트 101동 1203호');
    expect(lanes[0]).toHaveTextContent('통지 마감 D-33');
    expect(lanes[1]).toHaveTextContent('계약 없음');
    expect(getManagementLogList).toHaveBeenCalledWith(expect.objectContaining({ propertyId: undefined, size: 100 }));
    await userEvent.click(within(lanes[1]).getByRole('button', { name: /푸른마을/ }));
    expect(onNavigate).toHaveBeenCalledWith('logs', { propertyId: 'p2' });
  });

  it('거르기를 고르면 맞는 기록이 없는 호실은 흐리게 "맞는 기록 없음"', async () => {
    renderPage({ showAll: true });
    const all = await screen.findByRole('region', { name: '전체 호실 계약 타임라인' });
    await waitFor(() => expect(within(all).getAllByTestId('lane-dot')).toHaveLength(2));
    await userEvent.click(within(screen.getByRole('group', { name: '유형' })).getByRole('checkbox', { name: '메모' }));
    const lanes = within(all).getAllByTestId('home-lane');
    expect(lanes[0]).toHaveTextContent('1건');
    expect(lanes[1]).toHaveTextContent('맞는 기록 없음');
    expect(lanes[1].className).toContain('opacity-45');
    expect(within(all).getAllByTestId('lane-dot')).toHaveLength(1);
    // 계약 점은 거르기와 상관없이 남는다
    expect(within(lanes[0]).getAllByTestId('lane-contract-dot')).toHaveLength(1);
  });
});
