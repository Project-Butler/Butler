// 임대인 앱 채팅(docs/19 시안 A0~A5): 위 막대 말풍선 → 대화 목록 → 대화(첨부 보내기·제목 링크·읽기 전용).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getThreadList: vi.fn(),
  getThread: vi.fn(),
  getThreadMessageList: vi.fn(),
  postThreadMessage: vi.fn(),
  postThreadRead: vi.fn(),
  getNotificationUnreadCount: vi.fn(),
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  getTicket: vi.fn(),
  getContract: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김주인', role: 'LANDLORD' };
const TENANT = { id: 'tenant-1', name: '이세입', role: 'TENANT' };
const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });
const msg = (id, overrides = {}) => ({ id, body: `본문 ${id}`, sender: { id: TENANT.id }, attachments: [], isHidden: false, sentAt: '2026-11-26T05:20:00.000Z', ...overrides });
const thread = (id, overrides = {}) => ({
  id,
  contextType: 'TICKET',
  contextId: `ticket-${id}`,
  title: `101동 1001호 · 요청 ${id}`,
  participants: [{ id: USER.id, name: USER.name, role: 'LANDLORD' }, TENANT],
  lastMessage: msg(`last-${id}`, { body: `마지막 ${id}` }),
  unreadCount: 0,
  isReadOnly: false,
  createdAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (...entries) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

const jpeg = (name) => new File(['jpeg-bytes'], name, { type: 'image/jpeg' });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  api.getNotificationUnreadCount.mockResolvedValue({ count: 0 });
  api.getThreadList.mockResolvedValue(
    page([thread('a', { unreadCount: 2 }), thread('old', { isReadOnly: true, contextType: 'CONTRACT', contextId: 'c-old', title: '1108동 502호 계약' }), thread('b', { unreadCount: 1 })]),
  );
  api.getThread.mockImplementation(async (id) => thread(id));
  api.getThreadMessageList.mockResolvedValue({ data: [msg('m1')], meta: { nextCursor: null, hasNext: false } });
  api.postThreadRead.mockResolvedValue({});
  api.postThreadMessage.mockImplementation(async (_id, body) => msg('sent', { body: body.body, sender: { id: USER.id } }));
  api.getUploadRules.mockRejectedValue(new Error('규칙 없음'));
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'http://api/upload', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  let seq = 0;
  api.postDocument.mockImplementation(async () => {
    seq += 1;
    return { id: `doc-${seq}` };
  });
  api.deleteDocument.mockResolvedValue(undefined);
  api.getTicket.mockImplementation(() => new Promise(() => {}));
  api.getContract.mockImplementation(() => new Promise(() => {}));
});

afterEach(() => vi.clearAllMocks());

describe('A0 위 막대 말풍선', () => {
  it('홈형 위 막대에 종 왼쪽 말풍선, 숫자는 안 읽은 메시지가 있는 대화 수, 누르면 대화 목록', async () => {
    renderAt('/landlord/somewhere');
    const button = await screen.findByRole('button', { name: '대화, 안 읽은 대화 2개' });
    expect(button).toHaveTextContent('2');
    await userEvent.click(button);
    expect(where()).toBe('/landlord/threads');
  });

  it('안 읽은 대화가 없으면 숫자 없이 버튼만', async () => {
    api.getThreadList.mockResolvedValue(page([thread('a')]));
    renderAt('/landlord/somewhere');
    await waitFor(() => expect(api.getThreadList).toHaveBeenCalledWith({ size: 100 }));
    expect(screen.getByRole('button', { name: '대화' })).toHaveTextContent('');
  });
});

describe('A1·A5 대화 목록', () => {
  it('최근 순, 끝난 대화는 "지난 대화" 칩을 달고 맨 아래, 하단 탭은 내 자산', async () => {
    renderAt('/landlord/threads');
    const list = await screen.findByRole('list', { name: '대화 목록' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('요청 a'),
      expect.stringContaining('요청 b'),
      expect.stringContaining('1108동 502호 계약'),
    ]);
    expect(within(rows[2]).getByText('지난 대화')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '대화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '내 자산' })).toHaveAttribute('aria-current', 'page');
  });

  it('누르면 그 대화로 가고, 뒤로 가면 목록', async () => {
    renderAt('/landlord/threads');
    await userEvent.click(await screen.findByRole('button', { name: /요청 b/ }));
    expect(where()).toBe('/landlord/threads/b');
    await userEvent.click(await screen.findByRole('button', { name: '뒤로 가기' }));
    expect(where()).toBe('/landlord/threads');
  });

  it('대화가 없으면 시작하는 곳을 알려 준다', async () => {
    api.getThreadList.mockResolvedValue(page([]));
    renderAt('/landlord/threads');
    expect(await screen.findByText(/아직 대화가 없어요\./)).toHaveTextContent('호실 상세나 수리 요청에서 임차인과 대화를 시작할 수 있어요.');
  });
});

describe('A2~A4 대화', () => {
  it('위 막대: 상대 이름(임차인) + 둘째 줄 대화 제목, 누르면 요청 상세', async () => {
    renderAt('/landlord/threads/a');
    expect(await screen.findByRole('heading', { name: '이세입 임차인' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '101동 1001호 · 요청 a, 상세 보기' }));
    expect(where()).toBe('/landlord/tickets/ticket-a');
  });

  it('계약 대화의 제목을 누르면 계약 상세', async () => {
    api.getThread.mockResolvedValue(thread('c', { contextType: 'CONTRACT', contextId: 'c-1', title: '101동 1001호 계약' }));
    renderAt('/landlord/threads/c');
    await userEvent.click(await screen.findByRole('button', { name: '101동 1001호 계약, 상세 보기' }));
    expect(where()).toBe('/landlord/contracts/c-1');
  });

  it('주소로 바로 들어와 뒤로 가면 대화 목록', async () => {
    renderAt('/landlord/threads/a');
    await userEvent.click(await screen.findByRole('button', { name: '뒤로 가기' }));
    expect(where()).toBe('/landlord/threads');
  });

  it('A3: 사진 2장을 붙여 보내면 attachmentDocumentIds 로 보내고 첨부 줄을 비운다', async () => {
    renderAt('/landlord/threads/a');
    await userEvent.upload(await screen.findByLabelText('첨부 파일 선택'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(await screen.findByRole('list', { name: '보낼 첨부' })).toBeInTheDocument();
    expect(api.postUploadSession).toHaveBeenCalledWith(expect.objectContaining({ targetResourceType: 'THREAD_MESSAGE' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled());

    await userEvent.type(screen.getByLabelText('메시지'), '영수증이에요');
    await userEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(api.postThreadMessage).toHaveBeenCalledWith('a', { body: '영수증이에요', attachmentDocumentIds: ['doc-1', 'doc-2'] });
    await waitFor(() => expect(screen.queryByRole('list', { name: '보낼 첨부' })).not.toBeInTheDocument());
    expect(screen.getByLabelText('메시지')).toHaveValue('');
  });

  it('A4: 끝난 대화는 입력칸 대신 잠금 안내, 둘째 줄에 "지난 대화"', async () => {
    api.getThread.mockResolvedValue(thread('old', { isReadOnly: true, contextType: 'CONTRACT', contextId: 'c-old', title: '1108동 502호 계약' }));
    renderAt('/landlord/threads/old');
    expect(await screen.findByText('끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('메시지')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보내기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1108동 502호 계약 · 지난 대화, 상세 보기' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.');
    expect(api.getUploadRules).not.toHaveBeenCalled();
  });

  it('메시지가 없는 끝난 대화는 인사를 권하지 않는다', async () => {
    api.getThread.mockResolvedValue(thread('old', { isReadOnly: true }));
    api.getThreadMessageList.mockResolvedValue({ data: [], meta: { nextCursor: null, hasNext: false } });
    renderAt('/landlord/threads/old');
    expect(await screen.findByText('주고받은 메시지가 없어요.')).toBeInTheDocument();
    expect(screen.queryByText(/먼저 인사를 건네 보세요/)).not.toBeInTheDocument();
  });

  it('대화를 읽은 뒤 목록을 다시 받아 말풍선 숫자가 줄어든다', async () => {
    api.getThreadList.mockResolvedValueOnce(page([thread('a', { unreadCount: 2 })])).mockResolvedValue(page([thread('a', { unreadCount: 0 })]));
    renderAt('/landlord/somewhere');
    await userEvent.click(await screen.findByRole('button', { name: '대화, 안 읽은 대화 1개' }));
    await userEvent.click(await screen.findByRole('button', { name: /요청 a/ }));
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledWith('a', 'm1'));
    // 읽음이 성공하면 목록을 낡은 것으로 표시하고, 목록으로 돌아오면 새로 받는다
    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    await waitFor(() => expect(api.getThreadList.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /요청 a/ })).not.toHaveTextContent('안 읽은 메시지'));
  });

  it('보내다가 끝난 대화가 되면 잠금 안내로 바뀌고 올려 둔 첨부를 지운다', async () => {
    api.postThreadMessage.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { error: { code: 'THREAD_READ_ONLY', message: '끝난 대화예요' } } } }),
    );
    renderAt('/landlord/threads/a');
    await userEvent.upload(await screen.findByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    await waitFor(() => expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByRole('status')).toHaveTextContent('끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.');
    await waitFor(() => expect(api.deleteDocument).toHaveBeenCalledWith('doc-1'));
  });
});
