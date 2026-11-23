// 하우스 로그 PC 화면(1단계): 집 선택(U-02), 거르기 카드(시안 E, U-05), 표 열(U-06).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

import { getContractList, getManagementLogList, getPropertyList, getPropertyOwnershipList, getRenewalNoticeList, getTicketList } from '@butler/api-client';
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
const FORMER = home('p9', '예전아파트', '301');

const log = (overrides) => ({
  id: 'log-1',
  propertyId: 'p1',
  property: HOME_A,
  type: 'REPAIR',
  scope: 'PRIVATE',
  room: 'KITCHEN',
  title: '주방 수전 교체',
  content: '카트리지 교체',
  occurredOn: '2026-11-21',
  cost: 180000,
  attachments: [],
  author: { id: 'me' },
  source: null,
  isReadOnly: false,
  ...overrides,
});

const page = (items) => ({ data: items, meta: { page: 1, size: 20, total: items.length, hasNext: false } });

const mockHomes = (owned, former = []) => {
  vi.mocked(getPropertyList).mockImplementation(async ({ relation }) => page(relation === 'OWNER' ? owned : former));
};

const renderPage = (props = {}) => {
  const handlers = { onNavigate: vi.fn(), onOpenModal: vi.fn(), onCloseModal: vi.fn() };
  render(<ManagementLogListPage modal={null} {...handlers} {...props} />);
  return handlers;
};

// 표의 목록 요청(20건씩). 타임라인은 100건씩 끝까지 따로 읽는다.
const tableCalls = () => vi.mocked(getManagementLogList).mock.calls.filter(([params]) => params.size !== 100);
const lastListParams = () => tableCalls().at(-1)[0];

// 타임라인 데이터(소유 관계·계약·통지)는 기본으로 비어 있다.
beforeEach(() => {
  vi.mocked(getPropertyOwnershipList).mockResolvedValue(page([]));
  vi.mocked(getContractList).mockResolvedValue(page([]));
  vi.mocked(getRenewalNoticeList).mockResolvedValue([]);
});

describe('하우스 로그 집 선택 (U-02)', () => {
  beforeEach(() => {
    vi.mocked(getPropertyList).mockReset();
    vi.mocked(getManagementLogList).mockReset();
    vi.mocked(getTicketList).mockReset();
    vi.mocked(getManagementLogList).mockResolvedValue(page([log()]));
    vi.mocked(getTicketList).mockResolvedValue(page([]));
  });

  it('활성 소유 집이 2개 이상이면 집 카드와 모든 집의 처리할 일을 보여 준다', async () => {
    mockHomes([HOME_A, HOME_B], [FORMER]);
    vi.mocked(getTicketList).mockResolvedValue(
      page([
        { id: 't2', propertyId: 'p1', property: HOME_A, room: 'KITCHEN', title: '주방 수전에서 물이 새요', status: 'IN_PROGRESS', createdAt: '2026-11-20T01:00:00.000Z' },
        { id: 't1', propertyId: 'p1', property: HOME_A, room: 'BATHROOM', title: '욕실 천장 결로', status: 'OPEN', createdAt: '2026-11-18T01:00:00.000Z' },
        // 소유가 끝난 집의 요청은 빼야 한다.
        { id: 't9', propertyId: 'p9', property: FORMER, room: null, title: '예전 집 요청', status: 'OPEN', createdAt: '2026-11-01T01:00:00.000Z' },
      ]),
    );
    const { onNavigate } = renderPage();

    const cardA = await screen.findByRole('button', { name: /하늘숲아파트 101동 1203호/ });
    expect(screen.getByRole('button', { name: /푸른마을 101동 702호/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '기록 찾기' })).not.toBeInTheDocument();

    expect(getTicketList).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN,IN_PROGRESS', size: 100 }));
    // 최근 기록은 집마다 오늘까지 1건
    await waitFor(() =>
      expect(getManagementLogList).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'p2', size: 1, until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })),
    );

    const todo = screen.getByRole('region', { name: '모든 집의 처리할 일' });
    await within(todo).findByText('욕실 천장 결로');
    const rows = within(todo).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual(['욕실 천장 결로', '주방 수전에서 물이 새요']);
    expect(within(todo).queryByText('예전 집 요청')).not.toBeInTheDocument();
    expect(within(cardA).getByText(/진행 중 수리 요청/)).toHaveTextContent('2');

    await userEvent.click(cardA);
    expect(onNavigate).toHaveBeenCalledWith('logs', { propertyId: 'p1' });
    await userEvent.click(screen.getByRole('button', { name: '모든 집 기록 보기' }));
    expect(onNavigate).toHaveBeenCalledWith('logs', { all: true });
  });

  it('활성 소유 집이 1개면 카드 없이 그 집 표로 바로 간다', async () => {
    mockHomes([HOME_A], [FORMER]);
    const { onNavigate } = renderPage();
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('logs', { propertyId: 'p1' }, { replace: true }));
    expect(getTicketList).not.toHaveBeenCalled();
  });

  it('all=1(전체 호실)이면 집이 2개 이상이어도 표를 보여 준다', async () => {
    mockHomes([HOME_A, HOME_B]);
    renderPage({ showAll: true });
    expect(await screen.findByRole('region', { name: '기록 찾기' })).toBeInTheDocument();
    expect(await screen.findByText('주방 수전 교체')).toBeInTheDocument();
    expect(getTicketList).not.toHaveBeenCalled();
  });

  it('기록 주소(/logs/:logId)로 들어오면 카드가 아니라 표 + 상세 패널', async () => {
    mockHomes([HOME_A, HOME_B]);
    renderPage({ selectedLogId: 'log-1' });
    expect(await screen.findByRole('region', { name: '기록 찾기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '모든 집 기록 보기' })).not.toBeInTheDocument();
  });
});

describe('하우스 로그 거르기 카드 (시안 E)', () => {
  beforeEach(() => {
    vi.mocked(getPropertyList).mockReset();
    vi.mocked(getManagementLogList).mockReset();
    vi.mocked(getTicketList).mockReset();
    mockHomes([HOME_A, HOME_B]);
    vi.mocked(getManagementLogList).mockResolvedValue(page([log(), log({ id: 'log-2', room: null, title: '관리비 확인', type: 'NOTE', cost: null })]));
  });

  it('유형·방은 여러 개, 아무것도 안 고르면 전체에 체크, 전체를 누르면 그 줄이 풀린다', async () => {
    renderPage({ propertyId: 'p1' });
    await screen.findByText('주방 수전 교체');
    const typeRow = screen.getByRole('group', { name: '유형' });
    const roomRow = screen.getByRole('group', { name: '방' });
    expect(within(typeRow).getByRole('checkbox', { name: '전체' })).toHaveAttribute('aria-checked', 'true');
    expect(within(roomRow).getAllByRole('checkbox')).toHaveLength(11);

    await userEvent.click(within(typeRow).getByRole('checkbox', { name: '메모' }));
    await userEvent.click(within(typeRow).getByRole('checkbox', { name: '수리' }));
    expect(within(typeRow).getByRole('checkbox', { name: '전체' })).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(lastListParams()).toMatchObject({ propertyId: 'p1', type: 'REPAIR,NOTE' }));

    await userEvent.click(within(roomRow).getByRole('checkbox', { name: '방 없음' }));
    await userEvent.click(within(roomRow).getByRole('checkbox', { name: '주방' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ type: 'REPAIR,NOTE', room: 'KITCHEN,NONE' }));

    await userEvent.click(within(typeRow).getByRole('checkbox', { name: '전체' }));
    expect(within(typeRow).getByRole('checkbox', { name: '전체' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(lastListParams()).toMatchObject({ type: undefined, room: 'KITCHEN,NONE' }));
  });

  it('검색어는 앞뒤 공백을 빼고 잠시 뒤에 보내고, ×로 지운다', async () => {
    renderPage({ propertyId: 'p1' });
    await screen.findByText('주방 수전 교체');
    await userEvent.type(screen.getByRole('searchbox', { name: '검색' }), '  수전 ');
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '수전' }));

    await userEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(screen.getByRole('searchbox', { name: '검색' })).toHaveValue('');
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: undefined }));
  });

  it('공백만 적으면 검색어를 보내지 않는다', async () => {
    renderPage({ propertyId: 'p1' });
    await screen.findByText('주방 수전 교체');
    const before = tableCalls().length;
    await userEvent.type(screen.getByRole('searchbox', { name: '검색' }), '   ');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(tableCalls().length).toBe(before);
  });

  it('호실 칸: 전체 호실을 고르면 all, 집을 고르면 그 집으로', async () => {
    mockHomes([HOME_A, HOME_B], [FORMER]);
    const { onNavigate } = renderPage({ propertyId: 'p1' });
    const select = await screen.findByRole('combobox', { name: '호실' });
    // 소유가 끝난 집도 고를 수 있다.
    await within(select).findByRole('option', { name: FORMER.displayName });
    await userEvent.selectOptions(select, '');
    expect(onNavigate).toHaveBeenCalledWith('logs', { all: true }, { replace: true });
    await userEvent.selectOptions(select, 'p2');
    expect(onNavigate).toHaveBeenCalledWith('logs', { propertyId: 'p2' }, { replace: true });
  });

  it('조건에 맞는 기록이 없으면 초기화 버튼 없이 안내만', async () => {
    renderPage({ propertyId: 'p1' });
    await screen.findByText('주방 수전 교체');
    vi.mocked(getManagementLogList).mockResolvedValue(page([]));
    await userEvent.click(within(screen.getByRole('group', { name: '방' })).getByRole('checkbox', { name: '보일러실' }));
    expect(await screen.findByText('조건에 맞는 기록이 없어요')).toBeInTheDocument();
    expect(screen.getByText('검색어나 방·유형을 바꿔 보세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /초기화/ })).not.toBeInTheDocument();
  });
});

describe('하우스 로그 표 (U-06)', () => {
  beforeEach(() => {
    vi.mocked(getPropertyList).mockReset();
    vi.mocked(getManagementLogList).mockReset();
    mockHomes([HOME_A, HOME_B]);
    vi.mocked(getManagementLogList).mockResolvedValue(page([log(), log({ id: 'log-2', room: null, title: '관리비 확인', type: 'NOTE', cost: null })]));
  });

  const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent);

  it('집을 하나 고르면 호실 열이 없고, 방 칩(없으면 —)을 보여 준다', async () => {
    renderPage({ propertyId: 'p1' });
    await screen.findByText('주방 수전 교체');
    expect(headers()).toEqual(['날짜', '제목', '방', '구분', '비용']);
    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(within(first).getAllByRole('cell')[2]).toHaveTextContent('주방');
    expect(within(second).getAllByRole('cell')[2]).toHaveTextContent('—');
  });

  it('전체 호실이면 호실 열을 넣고, 상세 패널이 열리면 짧은 이름으로', async () => {
    renderPage({ showAll: true });
    await screen.findByText('주방 수전 교체');
    expect(headers()).toEqual(['날짜', '제목', '호실', '방', '구분', '비용']);
    const first = screen.getAllByRole('row')[1];
    expect(within(first).getAllByRole('cell')[2]).toHaveTextContent('하늘숲아파트 101동 1203호');

    await userEvent.click(first);
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[2].textContent).toBe('101동 1203호');
  });
});
