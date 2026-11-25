// PC 유지보수 요청(docs/10 v2.2 D4·D17, 시안 v2.2): 거르기 카드(호실·상태·분류·방) · 표 · 상세 패널 · 처리 시작·완료·취소 · 요청 등록.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  getPropertyList: vi.fn(),
  getTicketList: vi.fn(),
  getTicket: vi.fn(),
  patchTicket: vi.fn(),
  postTicket: vi.fn(),
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));

import { getPropertyList, getTicket, getTicketList, patchTicket, postTicket } from '@butler/api-client';
import { TicketListPage } from '../../../../src/landlord/web/pages/TicketListPage';

const HOME = { id: 'p1', buildingNo: '101', unitNo: '1001', displayName: '버틀러 단지 101동 1001호', myRelation: { verificationStatus: 'VERIFIED' } };
const ticket = (overrides = {}) => ({
  id: 't1',
  propertyId: 'p1',
  property: HOME,
  category: 'REPAIR',
  room: 'KITCHEN',
  title: '싱크대 아래 물이 새요',
  description: '문을 열면 바닥이 젖어 있어요.',
  status: 'OPEN',
  resolutionNote: null,
  cost: null,
  requester: { id: 'u2', name: '큐에이', role: 'TENANT' },
  historyLogId: null,
  attachments: [],
  isReadOnly: false,
  closedAt: null,
  createdAt: '2026-11-24T13:46:00Z',
  updatedAt: '2026-11-24T13:46:00Z',
  ...overrides,
});
const page = (items, total = items.length) => ({ data: items, meta: { page: 1, size: 20, total, hasNext: false } });
const COUNTS = { 'OPEN,IN_PROGRESS': 3, DONE: 2, CANCELED: 1 };

const renderPage = (props = {}) => {
  const handlers = { onNavigate: vi.fn(), onOpenRegister: vi.fn(), onCloseRegister: vi.fn(), onUnauthorized: vi.fn() };
  render(<TicketListPage {...handlers} {...props} />);
  return handlers;
};
const listCalls = () => vi.mocked(getTicketList).mock.calls.map(([params]) => params).filter((params) => params.size !== 1);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPropertyList).mockResolvedValue(page([HOME]));
  vi.mocked(getTicketList).mockImplementation(async (params) => {
    if (params.size === 1) return page([], params.status ? COUNTS[params.status] : 6);
    if (params.status === 'DONE') return page([ticket({ id: 't3', title: '보일러 점검', status: 'DONE', category: 'INSPECTION', room: null, requester: { role: 'LANDLORD' } })]);
    return page([ticket(), ticket({ id: 't2', title: '욕실 환풍기', status: 'IN_PROGRESS', room: 'BATHROOM' })]);
  });
  vi.mocked(getTicket).mockImplementation(async (id) => (id === 't2' ? ticket({ id: 't2', title: '욕실 환풍기', status: 'IN_PROGRESS', room: 'BATHROOM' }) : ticket()));
});

describe('거르기 카드와 표', () => {
  it('상태 세그먼트에 개수, 표에 상태 칩·제목·호실·방·분류·요청 구분', async () => {
    renderPage();
    const status = await screen.findByRole('radiogroup', { name: '상태' });
    await waitFor(() => expect(within(status).getByRole('radio', { name: /처리할 요청\s*3/ })).toHaveAttribute('aria-checked', 'true'));
    expect(within(status).getByRole('radio', { name: /전체\s*6/ })).toBeInTheDocument();
    expect(within(status).getByRole('radio', { name: /완료\s*2/ })).toBeInTheDocument();
    const row = (await screen.findByText('싱크대 아래 물이 새요')).closest('tr');
    expect(within(row).getByText('확인 필요')).toBeInTheDocument();
    expect(within(row).getByText('주방')).toBeInTheDocument();
    expect(within(row).getByText('수리')).toBeInTheDocument();
    expect(within(row).getByText('임차인')).toBeInTheDocument();
    expect(listCalls().at(-1)).toMatchObject({ status: 'OPEN,IN_PROGRESS', page: 1, size: 20 });
  });

  it('상태·분류·방을 고르면 그 조건으로 다시 부른다(개수도 분류·방을 따른다)', async () => {
    renderPage();
    await screen.findByText('싱크대 아래 물이 새요');
    await userEvent.click(screen.getByRole('radio', { name: /완료/ }));
    expect(await screen.findByText('보일러 점검')).toBeInTheDocument();
    expect(listCalls().at(-1)).toMatchObject({ status: 'DONE' });
    await userEvent.click(within(screen.getByRole('group', { name: '분류' })).getByRole('checkbox', { name: '점검' }));
    await userEvent.click(within(screen.getByRole('group', { name: '방' })).getByRole('checkbox', { name: '방 없음' }));
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ status: 'DONE', category: 'INSPECTION', room: 'NONE' }));
    expect(vi.mocked(getTicketList)).toHaveBeenCalledWith(expect.objectContaining({ size: 1, category: 'INSPECTION', room: 'NONE' }));
  });

  it('키보드: 상태는 화살표로 옮겨 고르고, 표 행은 Space 로 연다', async () => {
    renderPage();
    await screen.findByText('싱크대 아래 물이 새요');
    const todo = screen.getByRole('radio', { name: /처리할 요청/ });
    expect(todo).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /전체/ })).toHaveAttribute('tabindex', '-1');
    todo.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('radio', { name: /전체/ })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('radio', { name: /전체/ })).toHaveFocus();
    const row = (await screen.findByText('욕실 환풍기')).closest('tr');
    row.focus();
    await userEvent.keyboard(' ');
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(await screen.findByRole('complementary', { name: '요청 상세' })).toBeInTheDocument();
  });

  it('같은 요청 주소로 다시 들어오면(종 알림 등) 닫았던 패널을 다시 연다', async () => {
    const handlers = { onNavigate: vi.fn(), onOpenRegister: vi.fn(), onCloseRegister: vi.fn(), onUnauthorized: vi.fn() };
    const { rerender } = render(<TicketListPage {...handlers} selectedTicketId="t1" navKey="k1" />);
    const panel = await screen.findByRole('complementary', { name: '요청 상세' });
    await userEvent.click(within(panel).getByRole('button', { name: '요청 상세 닫기' }));
    expect(screen.queryByRole('complementary', { name: '요청 상세' })).toBeNull();
    rerender(<TicketListPage {...handlers} selectedTicketId="t1" navKey="k2" />);
    expect(await screen.findByRole('complementary', { name: '요청 상세' })).toBeInTheDocument();
  });

  it('호실을 고르면 주소(?propertyId=)로 바꾼다', async () => {
    const { onNavigate } = renderPage();
    await screen.findByRole('option', { name: HOME.displayName });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '호실' }), 'p1');
    expect(onNavigate).toHaveBeenCalledWith('tickets', { propertyId: 'p1' }, { replace: true });
  });

  it('처리할 요청이 없으면 안내', async () => {
    vi.mocked(getTicketList).mockResolvedValue(page([], 0));
    renderPage();
    expect(await screen.findByText('처리할 요청이 없어요')).toBeInTheDocument();
  });
});

describe('상세 패널과 처리', () => {
  it('행을 누르면 패널: 요청자·내용·대화 안내, [처리 시작]이면 처리 중으로 바꾼다', async () => {
    vi.mocked(patchTicket).mockResolvedValue(ticket({ status: 'IN_PROGRESS' }));
    renderPage();
    await userEvent.click(await screen.findByText('싱크대 아래 물이 새요'));
    const panel = await screen.findByRole('complementary', { name: '요청 상세' });
    expect(await within(panel).findByText('임차인 큐에이 요청')).toBeInTheDocument();
    expect(within(panel).getByText('임차인과의 대화는 앱에서 볼 수 있어요')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: '처리 시작' }));
    expect(patchTicket).toHaveBeenCalledWith('t1', { status: 'IN_PROGRESS' });
  });

  it('[완료 처리] 팝업: 중립 제목·호실 이력 안내, 처리 내용·비용으로 DONE', async () => {
    vi.mocked(patchTicket).mockResolvedValue(ticket({ id: 't2', status: 'DONE', historyLogId: 'log-1' }));
    renderPage({ selectedTicketId: 't2' });
    const panel = await screen.findByRole('complementary', { name: '요청 상세' });
    await userEvent.click(await within(panel).findByRole('button', { name: '완료 처리' }));
    const dialog = screen.getByRole('dialog', { name: '완료 처리' });
    expect(within(dialog).getByText(/욕실·화장실 수리 완료/)).toBeInTheDocument();
    expect(within(dialog).getByText('호실 이력')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/처리 내용/), '모터 교체');
    await userEvent.type(within(dialog).getByLabelText(/비용/), '80000');
    await userEvent.click(within(dialog).getByRole('button', { name: '완료 처리' }));
    expect(patchTicket).toHaveBeenCalledWith('t2', { status: 'DONE', resolutionNote: '모터 교체', cost: 80000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('[요청 취소]는 한 번 더 묻고 CANCELED', async () => {
    vi.mocked(patchTicket).mockResolvedValue(ticket({ status: 'CANCELED', isReadOnly: true }));
    renderPage({ selectedTicketId: 't1' });
    const panel = await screen.findByRole('complementary', { name: '요청 상세' });
    await userEvent.click(await within(panel).findByRole('button', { name: '요청 취소' }));
    await userEvent.click(within(panel).getByRole('button', { name: '요청 취소하기' }));
    expect(patchTicket).toHaveBeenCalledWith('t1', { status: 'CANCELED' });
  });

  it('완료된 요청: 비용·처리 내용, [하우스 로그에 남은 기록 보기]', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ status: 'DONE', isReadOnly: true, cost: 45000, resolutionNote: '패킹 교체', historyLogId: 'log-9', closedAt: '2026-11-24T14:00:00Z' }));
    const { onNavigate } = renderPage({ selectedTicketId: 't1' });
    const panel = await screen.findByRole('complementary', { name: '요청 상세' });
    expect(await within(panel).findByText('45,000원')).toBeInTheDocument();
    expect(within(panel).getByText('패킹 교체')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '처리 시작' })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: /하우스 로그에 남은 기록 보기/ }));
    expect(onNavigate).toHaveBeenCalledWith('logDetail', { logId: 'log-9' });
  });

  it('소유가 끝난 호실에 내가 직접 등록한 요청: [처리 시작]은 없고 [요청 취소]만(서버는 요청자라 읽기 전용으로 두지 않는다)', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket({ id: 't8', propertyId: 'p9', property: { ...HOME, id: 'p9' }, requester: { role: 'LANDLORD' }, isReadOnly: false }));
    renderPage({ selectedTicketId: 't8' });
    const panel = await screen.findByRole('complementary', { name: '요청 상세' });
    expect(await within(panel).findByRole('button', { name: '요청 취소' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '처리 시작' })).toBeNull();
  });

  it('completeOnOpen(앱 목록의 [완료 처리])이면 처리 중 요청의 완료 팝업을 바로 연다', async () => {
    renderPage({ selectedTicketId: 't2', completeOnOpen: true });
    expect(await screen.findByRole('dialog', { name: '완료 처리' })).toBeInTheDocument();
  });
});

describe('요청 등록 팝업', () => {
  it('호실·분류·방·제목·내용으로 등록하고 그 요청을 연다', async () => {
    vi.mocked(postTicket).mockResolvedValue(ticket({ id: 't9', requester: { role: 'LANDLORD' } }));
    const { onCloseRegister } = renderPage({ isRegisterOpen: true, propertyId: 'p1' });
    const dialog = await screen.findByRole('dialog', { name: '요청 등록' });
    await waitFor(() => expect(within(dialog).getByLabelText(/호실/)).toHaveValue('p1'));
    await userEvent.selectOptions(within(dialog).getByLabelText(/분류/), 'INSPECTION');
    await userEvent.selectOptions(within(dialog).getByLabelText(/방/), 'BOILER_ROOM');
    await userEvent.type(within(dialog).getByLabelText(/제목/), '보일러 점검');
    await userEvent.type(within(dialog).getByLabelText(/내용/), '12월 첫 주 방문');
    await userEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(postTicket).toHaveBeenCalledWith({
      propertyId: 'p1',
      category: 'INSPECTION',
      room: 'BOILER_ROOM',
      title: '보일러 점검',
      description: '12월 첫 주 방문',
      attachmentDocumentIds: [],
    });
    expect(onCloseRegister).toHaveBeenCalledWith({ ticketId: 't9' });
  });
});
