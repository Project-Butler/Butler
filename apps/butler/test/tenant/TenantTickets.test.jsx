// 임차인 수리 요청 화면(docs/10 v2.2 D7·D15, 시안 v2.2): 목록·요청하기·보낸 뒤·상세(수정·취소)·알림 목록.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getContractList: vi.fn(),
  getContract: vi.fn(),
  getDocumentList: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  getTicketList: vi.fn(),
  getTicket: vi.fn(),
  postTicket: vi.fn(),
  patchTicket: vi.fn(),
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
  getNotificationUnreadCount: vi.fn(),
  getNotificationList: vi.fn(),
  postNotificationRead: vi.fn(),
  postNotificationReadAll: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { TenantRoutes } = await import('../../src/tenant/TenantRoutes');
const { resetUploadRulesCache } = await import('../../src/shared/upload/useGetUploadRules');

const USER = { id: 't-1', name: '이세입', email: 'tenant@butler.test', role: 'TENANT' };
const HOME_A = { id: 'p-1', displayName: '버틀러 단지 101동 1001호' };
const HOME_B = { id: 'p-2', displayName: '버틀러 단지 102동 202호' };
const contract = (property, status = 'ACTIVE') => ({ id: `c-${property.id}`, status, property, landlord: { name: '김주인' }, startDate: '2026-01-01', endDate: '2030-12-31' });

const ticket = (overrides = {}) => ({
  id: 'tk-1',
  propertyId: HOME_A.id,
  property: HOME_A,
  category: 'REPAIR',
  room: 'KITCHEN',
  title: '싱크대 아래 물이 새요',
  description: '문을 열면 바닥이 젖어 있어요.',
  status: 'OPEN',
  resolutionNote: null,
  cost: null,
  attachments: [],
  isReadOnly: false,
  closedAt: null,
  createdAt: '2026-11-24T01:12:00Z',
  updatedAt: '2026-11-24T01:12:00Z',
  ...overrides,
});

const UPLOAD_RULES = {
  kinds: {
    IMAGE: { label: '사진', mimeTypes: ['image/jpeg', 'image/png'], extensions: ['jpg', 'jpeg', 'png'], maxBytes: 20 * 1024 * 1024 },
    PDF: { label: 'PDF', mimeTypes: ['application/pdf'], extensions: ['pdf'], maxBytes: 20 * 1024 * 1024 },
    VIDEO: { label: '동영상', mimeTypes: ['video/mp4', 'video/quicktime'], extensions: ['mp4', 'mov'], maxBytes: 50 * 1024 * 1024 },
  },
  resourceKinds: { TICKET: ['IMAGE', 'PDF', 'VIDEO'] },
};

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tenant/*" element={<TenantRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetUploadRulesCache();
  api.getContractList.mockResolvedValue({ data: [contract(HOME_A)], meta: {} });
  api.getTicketList.mockImplementation(async (params) => {
    if (params.size === 1) return { data: [], meta: { total: params.status === 'OPEN,IN_PROGRESS' ? 2 : 1 } };
    if (params.status === 'OPEN,IN_PROGRESS') {
      return { data: [ticket(), ticket({ id: 'tk-2', title: '욕실 환풍기가 안 돌아요', room: 'BATHROOM', status: 'IN_PROGRESS', attachments: [{ id: 'd-1' }] })], meta: {} };
    }
    return { data: [ticket({ id: 'tk-3', title: '베란다 창문', room: 'BALCONY', status: 'DONE', resolutionNote: '레일 교체', closedAt: '2026-11-24T05:00:00Z' })], meta: {} };
  });
  api.getTicket.mockResolvedValue(ticket());
  api.getUploadRules.mockResolvedValue(UPLOAD_RULES);
  api.getNotificationUnreadCount.mockResolvedValue({ count: 2 });
  api.getNotificationList.mockResolvedValue({ data: [], meta: { hasNext: false } });
});

describe('수리 요청 탭(①②⑧)', () => {
  it('진행 중 카드: 상태 칩(접수됨·처리 중)·방·분류·진행 단계, 탭 개수', async () => {
    renderAt('/tenant/tickets');
    expect(await screen.findByText('싱크대 아래 물이 새요')).toBeInTheDocument();
    expect(screen.getByText('접수됨')).toBeInTheDocument();
    expect(screen.getAllByText('처리 중').length).toBeGreaterThan(0);
    expect(screen.getByText('주방')).toBeInTheDocument();
    expect(screen.getByText('욕실·화장실')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /진행 중\s*2/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /완료\s*1/ })).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: /진행 단계/ }).length).toBe(2);
    expect(api.getTicketList).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN,IN_PROGRESS', sort: 'createdAt:desc' }));
  });

  it('완료 탭: 처리 내용 한 줄, 주소에 ?tab=closed', async () => {
    renderAt('/tenant/tickets');
    await userEvent.click(await screen.findByRole('tab', { name: /완료/ }));
    expect(await screen.findByText('베란다 창문')).toBeInTheDocument();
    expect(screen.getByText('처리 내용 · 레일 교체')).toBeInTheDocument();
    expect(where()).toBe('/tenant/tickets?tab=closed');
  });

  it('탭을 바꾸는 동안에는 앞 탭 카드가 보이지 않는다', async () => {
    renderAt('/tenant/tickets');
    expect(await screen.findByText('싱크대 아래 물이 새요')).toBeInTheDocument();
    let finish;
    vi.mocked(api.getTicketList).mockImplementation((params) =>
      params.size === 1 ? Promise.resolve({ data: [], meta: { total: 1 } }) : new Promise((resolve) => (finish = resolve)),
    );
    await userEvent.click(screen.getByRole('tab', { name: /완료/ }));
    expect(screen.queryByText('싱크대 아래 물이 새요')).toBeNull();
    expect(screen.getByText('요청을 불러오는 중이에요')).toBeInTheDocument();
    finish({ data: [ticket({ id: 'tk-3', title: '베란다 창문', status: 'DONE' })], meta: {} });
    expect(await screen.findByText('베란다 창문')).toBeInTheDocument();
  });

  it('카드를 누르면 상세, [요청하기]는 요청하기 화면', async () => {
    renderAt('/tenant/tickets');
    await userEvent.click(await screen.findByRole('button', { name: /싱크대 아래 물이 새요/ }));
    expect(where()).toBe('/tenant/tickets/tk-1');
  });

  it('요청할 집이 없으면 [요청하기] 대신 안내(⑧)', async () => {
    api.getContractList.mockResolvedValue({ data: [contract(HOME_A, 'EXPIRED')], meta: {} });
    api.getTicketList.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderAt('/tenant/tickets');
    expect(await screen.findByText('수리 요청을 보낼 집이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /요청하기/ })).not.toBeInTheDocument();
  });

  it('위 막대 종에 안 읽은 수, 누르면 알림 목록', async () => {
    renderAt('/tenant/tickets');
    const bell = await within(screen.getByRole('banner')).findByRole('button', { name: '알림, 안 읽은 알림 2개' });
    await userEvent.click(bell);
    expect(where()).toBe('/tenant/notifications');
  });
});

describe('수리 요청하기(③) → 보낸 뒤(④)', () => {
  it('집이 하나면 고정, 분류·방·제목·설명으로 보내고 보낸 뒤 화면으로', async () => {
    api.postTicket.mockResolvedValue(ticket({ id: 'tk-new' }));
    renderAt('/tenant/tickets/new');
    expect(await screen.findByText(HOME_A.displayName)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '점검' }));
    await userEvent.click(screen.getByRole('radio', { name: '주방' }));
    await userEvent.type(screen.getByLabelText(/제목/), '싱크대 점검');
    await userEvent.type(screen.getByLabelText('자세히 알려 주세요'), '물이 새요');
    expect(await screen.findByText(/MP4·MOV 동영상은 50MB/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '요청 보내기' }));
    expect(api.postTicket).toHaveBeenCalledWith({
      propertyId: HOME_A.id,
      category: 'INSPECTION',
      room: 'KITCHEN',
      title: '싱크대 점검',
      description: '물이 새요',
      attachmentDocumentIds: [],
    });
    expect(await screen.findByRole('heading', { name: '요청을 보냈어요' })).toBeInTheDocument();
    expect(where()).toBe('/tenant/tickets/tk-new/sent');
    await userEvent.click(screen.getByRole('button', { name: '요청 보기' }));
    expect(where()).toBe('/tenant/tickets/tk-new');
  });

  it('키보드: 분류 칩은 화살표로 옮겨 고르고, 칩 묶음은 위 글자로 이름이 붙는다', async () => {
    renderAt('/tenant/tickets/new');
    const group = await screen.findByRole('radiogroup', { name: '무엇을 요청할까요' });
    const repair = within(group).getByRole('radio', { name: '수리' });
    expect(repair).toHaveAttribute('tabindex', '0');
    repair.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(group).getByRole('radio', { name: '점검' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: '점검' })).toHaveFocus();
    expect(screen.getByRole('radiogroup', { name: /어디인가요/ })).toBeInTheDocument();
  });

  it('방은 선택: 고른 방을 다시 누르면 빠지고 room 을 보내지 않는다', async () => {
    api.postTicket.mockResolvedValue(ticket({ id: 'tk-new' }));
    renderAt('/tenant/tickets/new');
    const kitchen = await screen.findByRole('radio', { name: '주방' });
    await userEvent.click(kitchen);
    await userEvent.click(kitchen);
    expect(kitchen).toHaveAttribute('aria-checked', 'false');
    await userEvent.type(screen.getByLabelText(/제목/), '소음');
    await userEvent.type(screen.getByLabelText('자세히 알려 주세요'), '밤마다 소리가 나요');
    await userEvent.click(screen.getByRole('button', { name: '요청 보내기' }));
    expect(api.postTicket.mock.calls[0][0]).not.toHaveProperty('room');
  });

  it('집이 여러 개면 고르고 나서 보낼 수 있다', async () => {
    api.getContractList.mockResolvedValue({ data: [contract(HOME_A), contract(HOME_B, 'UPCOMING')], meta: {} });
    renderAt('/tenant/tickets/new');
    const select = await screen.findByRole('combobox');
    await userEvent.type(screen.getByLabelText(/제목/), '누수');
    await userEvent.type(screen.getByLabelText('자세히 알려 주세요'), '물이 새요');
    expect(screen.getByRole('button', { name: '요청 보내기' })).toBeDisabled();
    await userEvent.selectOptions(select, HOME_B.id);
    expect(screen.getByRole('button', { name: '요청 보내기' })).toBeEnabled();
  });
});

describe('요청 상세(⑤⑥)와 고치기·취소', () => {
  it('접수 상태: 세로 단계, 아래 고정 [수정][요청 취소], 하단 탭 없음', async () => {
    renderAt('/tenant/tickets/tk-1');
    expect(await screen.findByRole('heading', { name: '싱크대 아래 물이 새요' })).toBeInTheDocument();
    expect(screen.getByText('임대인이 확인하면 바뀌어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '하단 메뉴' })).not.toBeInTheDocument();
  });

  it('[요청 취소] → 확인 → CANCELED 로 바꾸고 다시 읽는다', async () => {
    api.patchTicket.mockResolvedValue(ticket({ status: 'CANCELED' }));
    renderAt('/tenant/tickets/tk-1');
    await userEvent.click(await screen.findByRole('button', { name: '요청 취소' }));
    expect(screen.getByText('이 요청을 취소할까요? 취소하면 되돌릴 수 없어요.')).toBeInTheDocument();
    api.getTicket.mockResolvedValue(ticket({ status: 'CANCELED', isReadOnly: true, closedAt: '2026-11-24T02:00:00Z' }));
    await userEvent.click(screen.getByRole('button', { name: '요청 취소하기' }));
    expect(api.patchTicket).toHaveBeenCalledWith('tk-1', { status: 'CANCELED' });
    expect(await screen.findByText(/취소된 요청이에요/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '하단 메뉴' })).toBeInTheDocument();
  });

  it('[수정] → 바뀐 칸만 보내고 상세로 돌아간다', async () => {
    api.patchTicket.mockResolvedValue(ticket({ title: '싱크대 누수' }));
    renderAt('/tenant/tickets/tk-1');
    await userEvent.click(await screen.findByRole('button', { name: '수정' }));
    expect(where()).toBe('/tenant/tickets/tk-1/edit');
    const title = await screen.findByDisplayValue('싱크대 아래 물이 새요');
    expect(screen.getByRole('button', { name: '고친 내용 저장' })).toBeDisabled();
    await userEvent.clear(title);
    await userEvent.type(title, '싱크대 누수');
    await userEvent.click(screen.getByRole('button', { name: '고친 내용 저장' }));
    expect(api.patchTicket).toHaveBeenCalledWith('tk-1', { title: '싱크대 누수' });
    await waitFor(() => expect(where()).toBe('/tenant/tickets/tk-1'));
  });

  it('완료 상태: 처리 내용·완료일, "내가 보낸 내용", 비용 없음, 하단 탭', async () => {
    api.getTicket.mockResolvedValue(
      ticket({ status: 'DONE', isReadOnly: true, resolutionNote: '창문 레일을 교체했어요.', closedAt: '2026-11-24T05:00:00Z', room: 'BALCONY' }),
    );
    renderAt('/tenant/tickets/tk-1');
    expect(await screen.findByText('창문 레일을 교체했어요.')).toBeInTheDocument();
    expect(screen.getByText('내가 보낸 내용')).toBeInTheDocument();
    expect(screen.getByText('베란다')).toBeInTheDocument();
    expect(screen.queryByText(/비용|원$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '하단 메뉴' })).toBeInTheDocument();
  });

  it('첨부: 사진은 격자, 동영상은 [재생]', async () => {
    api.getTicket.mockResolvedValue(
      ticket({
        status: 'IN_PROGRESS',
        isReadOnly: true,
        attachments: [
          { id: 'd-1', fileName: 'leak.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 },
          { id: 'd-2', fileName: 'leak.mp4', mimeType: 'video/mp4', sizeBytes: 3000000 },
        ],
      }),
    );
    api.postDocumentDownloadUrl.mockResolvedValue({ url: 'https://files.example/d', expiresAt: 'x' });
    renderAt('/tenant/tickets/tk-1');
    expect(await screen.findByRole('button', { name: 'leak.mp4 재생' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 1 크게 보기' })).toBeInTheDocument();
  });

  it('없는 요청은 404 안내', async () => {
    api.getTicket.mockRejectedValue({ response: { status: 404, data: { error: { code: 'TICKET_NOT_FOUND', message: '요청을 찾을 수 없습니다.' } } } });
    renderAt('/tenant/tickets/nope');
    expect(await screen.findByText('요청을 찾을 수 없어요.')).toBeInTheDocument();
  });
});

describe('알림 목록(⑨)', () => {
  it('누르면 읽음 처리하고 수리 요청 상세로 간다', async () => {
    api.getNotificationList.mockResolvedValue({
      data: [{ id: 'n-1', title: '수리 요청이 완료됐어요', body: '버틀러 단지 · 베란다 — 창문', link: '/tickets/tk-3', readAt: null, createdAt: new Date().toISOString() }],
      meta: { hasNext: false },
    });
    api.postNotificationRead.mockResolvedValue({});
    renderAt('/tenant/notifications');
    await userEvent.click(await screen.findByRole('button', { name: /수리 요청이 완료됐어요/ }));
    expect(api.postNotificationRead).toHaveBeenCalledWith('n-1');
    expect(where()).toBe('/tenant/tickets/tk-3');
  });

  it('[모두 읽음]', async () => {
    api.getNotificationList.mockResolvedValue({
      data: [{ id: 'n-1', title: '수리 요청 처리가 시작됐어요', body: null, link: '/tickets/tk-1', readAt: null, createdAt: new Date().toISOString() }],
      meta: { hasNext: false },
    });
    api.postNotificationReadAll.mockResolvedValue({});
    renderAt('/tenant/notifications');
    const button = await screen.findByRole('button', { name: '모두 읽음' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(api.postNotificationReadAll).toHaveBeenCalled();
  });

  it('알림이 없으면 안내', async () => {
    renderAt('/tenant/notifications');
    expect(await screen.findByText('아직 받은 알림이 없어요.')).toBeInTheDocument();
  });
});
