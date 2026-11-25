// 관리자 유지보수(수리·점검 요청) 목록·상세(#245). 읽기 전용이고, 필터·쪽 번호는 URL 쿼리에 둔다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getTicketList: vi.fn(),
  getTicket: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));

import { getTicket, getTicketList } from '@butler/api-client';
import { TicketDetailPage } from '../../src/admin/pages/TicketDetailPage';
import { TicketListPage } from '../../src/admin/pages/TicketListPage';

const ticket = (overrides = {}) => ({
  id: 't1',
  propertyId: 'p1',
  property: { id: 'p1', displayName: '버틀러 단지 101동 1001호' },
  contractId: 'c1',
  category: 'REPAIR',
  room: 'KITCHEN',
  title: '싱크대 아래 물이 새요',
  description: '문을 열면 바닥이 젖어 있어요.',
  status: 'OPEN',
  resolutionNote: null,
  cost: null,
  requester: { id: 'u2', name: '이세입', role: 'TENANT' },
  historyLogId: null,
  attachments: [],
  isReadOnly: true,
  closedAt: null,
  createdAt: '2026-11-24T13:46:00Z',
  updatedAt: '2026-11-24T13:46:00Z',
  ...overrides,
});
const page = (items, total = items.length) => ({ data: items, meta: { page: 1, size: 20, total, hasNext: false } });

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderAt = (url, element, path) => {
  const handlers = { onNavigate: vi.fn(), onUnauthorized: vi.fn() };
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={path} element={<>{element(handlers)}<LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return handlers;
};
const renderList = (url = '/tickets') => renderAt(url, (handlers) => <TicketListPage {...handlers} />, '/tickets');
const renderDetail = (url = '/tickets/t1') => renderAt(url, (handlers) => <TicketDetailPage {...handlers} />, '/tickets/:ticketId');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('관리자 유지보수 목록', () => {
  it('URL 쿼리의 상태 필터로 부르고, 표에 호실·분류·위치·요청자·상태를 보여 준다', async () => {
    vi.mocked(getTicketList).mockResolvedValue(page([ticket()], 1));
    renderList('/tickets?status=OPEN');

    const row = (await screen.findByRole('button', { name: '싱크대 아래 물이 새요' })).closest('tr');
    expect(getTicketList).toHaveBeenCalledWith({ status: 'OPEN', category: undefined, sort: 'createdAt:desc', page: 1, size: 20 });
    expect(within(row).getByText('버틀러 단지 101동 1001호')).toBeInTheDocument();
    expect(within(row).getByText('수리')).toBeInTheDocument();
    expect(within(row).getByText('주방')).toBeInTheDocument();
    expect(within(row).getByText('이세입')).toBeInTheDocument();
    expect(within(row).getByText('접수')).toBeInTheDocument();
    expect(screen.getByText('총 1건')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '처리 상태' })).getByRole('button', { name: '접수' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('필터를 바꾸면 URL 쿼리에 남기고 쪽 번호는 처음으로 돌린다', async () => {
    vi.mocked(getTicketList).mockResolvedValue(page([ticket()], 1));
    renderList('/tickets?status=OPEN&page=3');
    await screen.findByRole('button', { name: '싱크대 아래 물이 새요' });

    await userEvent.click(within(screen.getByRole('group', { name: '분류' })).getByRole('button', { name: '점검' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/tickets?status=OPEN&category=INSPECTION');
    await waitFor(() =>
      expect(getTicketList).toHaveBeenLastCalledWith({ status: 'OPEN', category: 'INSPECTION', sort: 'createdAt:desc', page: 1, size: 20 }),
    );
  });

  it('제목을 누르면 상세로 간다', async () => {
    vi.mocked(getTicketList).mockResolvedValue(page([ticket()]));
    const { onNavigate } = renderList();

    await userEvent.click(await screen.findByRole('button', { name: '싱크대 아래 물이 새요' }));

    expect(onNavigate).toHaveBeenCalledWith('ticketDetail', { ticketId: 't1' });
  });

  it('결과가 없으면 빈 안내를 보여 준다', async () => {
    vi.mocked(getTicketList).mockResolvedValue(page([]));
    renderList();

    expect(await screen.findByText('조건에 맞는 요청이 없습니다.')).toBeInTheDocument();
  });
});

describe('관리자 유지보수 상세', () => {
  it('요청 내용과 처리 결과를 읽기 전용으로 보여 준다(처리 버튼 없음)', async () => {
    vi.mocked(getTicket).mockResolvedValue(
      ticket({ status: 'DONE', resolutionNote: '배수관 교체', closedAt: '2026-11-25T02:00:00Z', historyLogId: 'log-1' }),
    );
    renderDetail();

    expect(await screen.findByRole('heading', { name: '싱크대 아래 물이 새요' })).toBeInTheDocument();
    expect(getTicket).toHaveBeenCalledWith('t1');
    expect(screen.getByText('문을 열면 바닥이 젖어 있어요.')).toBeInTheDocument();
    expect(screen.getByText('배수관 교체')).toBeInTheDocument();
    expect(screen.getByText('완료 요약 기록됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /처리 시작|완료 처리|취소/ })).not.toBeInTheDocument();
  });

  it('요청자·계약·감사 로그로 이동한다', async () => {
    vi.mocked(getTicket).mockResolvedValue(ticket());
    const { onNavigate } = renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: '이세입' }));
    expect(onNavigate).toHaveBeenCalledWith('userDetail', { userId: 'u2' });

    await userEvent.click(screen.getByRole('button', { name: 'c1' }));
    expect(onNavigate).toHaveBeenCalledWith('contractDetail', { contractId: 'c1' });

    await userEvent.click(screen.getByRole('button', { name: '이 요청의 감사 로그' }));
    expect(onNavigate).toHaveBeenCalledWith('auditLogs', undefined, '?resourceType=TICKET&resourceId=t1');
  });

  it('없는 요청이면 서버 문구를 보여 주고 다시 시도 버튼은 두지 않는다', async () => {
    vi.mocked(getTicket).mockRejectedValue({
      response: { status: 404, data: { error: { code: 'TICKET_NOT_FOUND', message: '요청을 찾을 수 없습니다.' } } },
    });
    renderDetail();

    expect(await screen.findByText('요청을 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다시/ })).not.toBeInTheDocument();
  });
});
