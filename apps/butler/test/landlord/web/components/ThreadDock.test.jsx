// 임대인 PC 오른쪽 아래 대화 팝업(docs/19 시안 P1~P4, 12장 PR C).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THREAD_DOCK_TRIGGER_ID, ThreadDock } from '../../../../src/landlord/web/components/ThreadDock/ThreadDock';
import { threadDockStorageKey, ThreadDockProvider, useThreadDock } from '../../../../src/landlord/web/components/ThreadDock/ThreadDockContext';
import { chatDockPositionClass, VerificationProgressDock } from '../../../../src/landlord/web/components/VerificationProgressDock/VerificationProgressDock';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getThreadList: vi.fn(),
  getThread: vi.fn(),
  getThreadMessageList: vi.fn(),
  postThreadMessage: vi.fn(),
  postThreadRead: vi.fn(),
  postThread: vi.fn(),
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  getPropertyOwnershipList: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const USER_ID = 'l-1';
const TENANT = { id: 'tenant-1', name: '이세입', role: 'TENANT' };
const page = (data) => ({ data, meta: { page: 1, size: 100, total: data.length, hasNext: false } });
const msg = (id, overrides = {}) => ({ id, body: `본문 ${id}`, sender: { id: TENANT.id }, attachments: [], isHidden: false, sentAt: '2026-11-26T05:20:00.000Z', ...overrides });
const thread = (id, overrides = {}) => ({
  id,
  contextType: 'TICKET',
  contextId: `ticket-${id}`,
  title: `101동 1001호 · 요청 ${id}`,
  participants: [{ id: USER_ID, name: '김주인', role: 'LANDLORD' }, TENANT],
  lastMessage: msg(`last-${id}`),
  unreadCount: 0,
  isReadOnly: false,
  createdAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});

// 위 막대 말풍선 대신 쓰는 버튼(레이아웃의 토글과 같은 동작)
const Trigger = () => {
  const dock = useThreadDock();
  return (
    <>
      <button type="button" id={THREAD_DOCK_TRIGGER_ID} onClick={() => (dock.status === 'open' ? dock.close() : dock.status === 'collapsed' ? dock.expand() : dock.openList())}>
        말풍선
      </button>
      <button type="button" onClick={() => dock.openContext('TICKET', 'ticket-x')}>
        요청 대화 열기
      </button>
      {dock.openError && <p>{dock.openError.code}</p>}
      <VerificationProgressDock chatDock={dock.status === 'closed' ? 'none' : dock.status} onNavigate={vi.fn()} onUnauthorized={vi.fn()} />
    </>
  );
};

const onNavigate = vi.fn();
const renderDock = () =>
  render(
    <ThreadDockProvider userId={USER_ID} onUnauthorized={vi.fn()} onNavigate={onNavigate}>
      <Trigger />
      <ThreadDock />
    </ThreadDockProvider>,
  );

const jpeg = (name) => new File(['jpeg-bytes'], name, { type: 'image/jpeg' });
const saved = () => JSON.parse(window.sessionStorage.getItem(threadDockStorageKey(USER_ID)) ?? 'null');

beforeEach(() => {
  window.sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  api.getThreadList.mockResolvedValue(page([thread('a', { unreadCount: 2 }), thread('b'), thread('old', { isReadOnly: true, title: '1108동 502호 계약' })]));
  api.getThread.mockImplementation(async (id) => thread(id));
  api.getThreadMessageList.mockResolvedValue({ data: [msg('m1')], meta: { nextCursor: null, hasNext: false } });
  api.postThreadRead.mockResolvedValue({});
  api.postThreadMessage.mockImplementation(async (_id, body) => msg('sent', { body: body.body, sender: { id: USER_ID } }));
  api.getUploadRules.mockRejectedValue(new Error('규칙 없음'));
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'http://api/upload', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  api.postDocument.mockResolvedValue({ id: 'doc-1' });
  api.deleteDocument.mockResolvedValue(undefined);
  api.getPropertyOwnershipList.mockResolvedValue(page([]));
});

afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('P4 닫힘', () => {
  it('처음에는 아무것도 없고 목록도 받지 않는다', () => {
    renderDock();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.getThreadList).not.toHaveBeenCalled();
  });
});

describe('P1 목록 · P2 대화', () => {
  it('말풍선 → 막지 않는 팝업(role=dialog, aria-modal=false)에 대화 목록, 제목에 포커스', async () => {
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    const dialog = screen.getByRole('dialog', { name: '대화' });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(await within(dialog).findByRole('list', { name: '대화 목록' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '대화' })).toHaveFocus();
  });

  it('목록 한 줄을 누르면 그 대화, [대화 목록]으로 돌아간다. 제목 줄은 요청 상세로 간다', async () => {
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    await userEvent.click(await screen.findByRole('button', { name: /요청 a/ }));
    expect(await screen.findByRole('heading', { name: '이세입 임차인' })).toBeInTheDocument();
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledWith('a', 'm1'));

    await userEvent.click(screen.getByRole('button', { name: '101동 1001호 · 요청 a, 상세 보기' }));
    expect(onNavigate).toHaveBeenCalledWith('ticketDetail', { ticketId: 'ticket-a' });

    await userEvent.click(screen.getByRole('button', { name: '대화 목록' }));
    expect(await screen.findByRole('list', { name: '대화 목록' })).toBeInTheDocument();
  });

  it('대화에서 사진을 붙여 보낸다', async () => {
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    await userEvent.click(await screen.findByRole('button', { name: /요청 a/ }));
    await userEvent.upload(await screen.findByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    await waitFor(() => expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(api.postThreadMessage).toHaveBeenCalledWith('a', { body: '', attachmentDocumentIds: ['doc-1'] });
  });

  it('대화 A에서 사진을 고른 뒤 대화 B로 바꾸면 B의 입력칸·첨부 줄은 비어 있다(key=threadId)', async () => {
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    await userEvent.click(await screen.findByRole('button', { name: /요청 a/ }));
    await userEvent.type(await screen.findByLabelText('메시지'), 'A에게');
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    expect(await screen.findByRole('list', { name: '보낼 첨부' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '대화 목록' }));
    await userEvent.click(await screen.findByRole('button', { name: /요청 b/ }));
    await screen.findByRole('heading', { name: '이세입 임차인' });
    expect(await screen.findByLabelText('메시지')).toHaveValue('');
    expect(screen.queryByRole('list', { name: '보낼 첨부' })).not.toBeInTheDocument();
  });

  it('끝난 대화는 입력칸 대신 잠금 안내', async () => {
    api.getThread.mockResolvedValue(thread('old', { isReadOnly: true, title: '1108동 502호 계약' }));
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    await userEvent.click(await screen.findByRole('button', { name: /1108동 502호 계약/ }));
    expect(await screen.findByText('끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('메시지')).not.toBeInTheDocument();
  });
});

describe('P3 접힘', () => {
  it('접으면 막대(상대 · 제목, 안 읽은 수)로 남고 포커스가 막대로, 접힌 동안 폴링·읽음 없음, 펼치면 곧바로 받고 읽음', async () => {
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    await userEvent.click(await screen.findByRole('button', { name: /요청 a/ }));
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledTimes(1));
    const callsBefore = api.getThreadMessageList.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: '대화 접기' }));
    const bar = screen.getByRole('button', { name: /이세입 · 101동 1001호 · 요청 a 펼치기, 안 읽은 메시지 2개/ });
    expect(bar).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saved()).toEqual({ status: 'collapsed', view: 'thread', threadId: 'a' });

    api.getThreadMessageList.mockResolvedValue({ data: [msg('m2')], meta: { nextCursor: null, hasNext: false } });
    await userEvent.click(bar);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(api.getThreadMessageList.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(api.postThreadRead).toHaveBeenLastCalledWith('a', 'm2'));
  });

  it('닫으면 아무것도 남지 않고 포커스는 말풍선 버튼으로', async () => {
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '말풍선' }));
    await screen.findByRole('list', { name: '대화 목록' });
    await userEvent.click(screen.getByRole('button', { name: '대화 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /펼치기/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '말풍선' })).toHaveFocus();
    expect(saved()).toBeNull();
  });
});

describe('세션 기억', () => {
  it('접힌 대화로 복원되면 막대만 보이고 읽음을 보내지 않는다', async () => {
    window.sessionStorage.setItem(threadDockStorageKey(USER_ID), JSON.stringify({ status: 'collapsed', view: 'thread', threadId: 'a' }));
    renderDock();
    expect(await screen.findByRole('button', { name: /요청 a 펼치기/ })).toBeInTheDocument();
    await waitFor(() => expect(api.getThread).toHaveBeenCalledWith('a'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.postThreadRead).not.toHaveBeenCalled();
  });

  it('sessionStorage 가 실패해도 닫힌 채로 그려진다', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderDock();
    expect(screen.getByRole('button', { name: '말풍선' })).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('계약·요청 대화 열기(openContext)', () => {
  it('성공하면 그 대화로 팝업이 열린다', async () => {
    api.postThread.mockResolvedValue({ id: 'b' });
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '요청 대화 열기' }));
    expect(api.postThread).toHaveBeenCalledWith({ contextType: 'TICKET', contextId: 'ticket-x' });
    expect(await screen.findByRole('dialog', { name: /이세입/ })).toBeInTheDocument();
  });

  it('422면 오류만 두고 팝업은 그대로(닫힘)', async () => {
    api.postThread.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 422, data: { error: { code: 'THREAD_CONTEXT_NOT_SUPPORTED', message: '대화를 열 수 없어요' } } } }),
    );
    renderDock();
    await userEvent.click(screen.getByRole('button', { name: '요청 대화 열기' }));
    expect(await screen.findByText('THREAD_CONTEXT_NOT_SUPPORTED')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('권리자 인증 진행 표시와 겹침(chatDock)', () => {
  it.each([
    ['none', ['bottom-8', 'right-8'], ['lg:right-[428px]', 'bottom-24']],
    ['open', ['bottom-8', 'right-8', 'lg:right-[428px]'], ['bottom-24']],
    ['collapsed', ['bottom-24', 'right-8'], ['bottom-8', 'lg:right-[428px]']],
  ])('%s: 팝업이 열리면 왼쪽으로(1024 미만은 right-8 그대로), 접힘 막대면 위로', (chatDock, has, hasNot) => {
    const classes = chatDockPositionClass(chatDock).split(' ');
    for (const name of has) expect(classes).toContain(name);
    for (const name of hasNot) expect(classes).not.toContain(name);
  });
});
