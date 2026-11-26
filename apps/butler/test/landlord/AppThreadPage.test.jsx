// 임대인 앱 대화 화면(ThreadPage) — 공용 부품(shared/threads)으로 바꾼 뒤에도 보이는 것·동작이 같은지(docs/19 PR A1 회귀).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadPage } from '../../src/landlord/app/pages/ThreadPage';

const api = vi.hoisted(() => ({
  getThread: vi.fn(),
  getThreadMessageList: vi.fn(),
  postThreadMessage: vi.fn(),
  postThreadRead: vi.fn(),
  getUploadRules: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  queryKey: { THREADS: 'threads' },
}));
vi.mock('@butler/api-client', () => api);

const ME = { id: 'landlord-1', name: '김주인' };
const THREAD = {
  id: 't1',
  title: '101동 1001호 계약',
  isReadOnly: false,
  participants: [
    { id: 'landlord-1', name: '김주인', role: 'LANDLORD' },
    { id: 'tenant-1', name: '이세입', role: 'TENANT' },
  ],
};
const msg = (id, overrides = {}) => ({ id, body: `본문 ${id}`, sender: { id: 'tenant-1' }, attachments: [], isHidden: false, sentAt: '2026-11-26T05:20:00.000Z', ...overrides });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/landlord/threads/t1']}>
      <ThreadPage threadId="t1" user={ME} onUnauthorized={vi.fn()} />
    </MemoryRouter>,
  );

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  api.getThread.mockResolvedValue(THREAD);
  api.getThreadMessageList.mockResolvedValue({ data: [msg('m2', { sender: { id: 'landlord-1' }, body: '확인했어요' }), msg('m1')], meta: { nextCursor: null, hasNext: false } });
  api.postThreadRead.mockResolvedValue({});
  api.postThreadMessage.mockImplementation(async (_id, body) => msg('m3', { body: body.body, sender: { id: 'landlord-1' }, sentAt: '2026-11-26T05:30:00.000Z' }));
});

afterEach(() => vi.clearAllMocks());

describe('임대인 앱 ThreadPage (공용 부품)', () => {
  it('제목은 상대 · 대화 제목, 안내·날짜 줄·말풍선을 지금처럼 그린다', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: '이세입 · 101동 1001호 계약' })).toBeInTheDocument();
    expect(screen.getByText('보낸 메시지는 수정·삭제할 수 없어요.')).toBeInTheDocument();
    const day = screen.getByRole('region', { name: '2026-11-26 (목)' });
    expect(within(day).getByText('본문 m1')).toBeInTheDocument();
    expect(within(day).getByText('확인했어요').closest('li').className).toMatch(/items-end/);
  });

  it('입력칸은 글만(첨부 버튼·남은 글자 수 없음), 업로드 규칙도 받지 않는다', async () => {
    renderPage();
    await screen.findByLabelText('메시지');
    expect(screen.queryByRole('button', { name: '사진·파일 첨부' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('메시지'), '가'.repeat(5));
    expect(screen.queryByText(/남은 글자/)).not.toBeInTheDocument();
    expect(api.getUploadRules).not.toHaveBeenCalled();
  });

  it('글을 보내면 { body } 로 보내고 입력칸을 비우며 말풍선이 붙는다', async () => {
    renderPage();
    const input = await screen.findByLabelText('메시지');
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
    await userEvent.type(input, '내일 3시에 갈게요');
    await userEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(api.postThreadMessage).toHaveBeenCalledWith('t1', { body: '내일 3시에 갈게요' });
    await waitFor(() => expect(input).toHaveValue(''));
    expect(screen.getByText('내일 3시에 갈게요')).toBeInTheDocument();
  });

  it('처음 들어오면 마지막 메시지까지 읽음 처리한다', async () => {
    renderPage();
    await waitFor(() => expect(api.postThreadRead).toHaveBeenCalledWith('t1', 'm2'));
  });

  it('읽기 전용 대화면 안내와 막힌 입력칸', async () => {
    api.getThread.mockResolvedValue({ ...THREAD, isReadOnly: true });
    renderPage();
    expect(await screen.findByText('끝난 계약·요청의 대화라 지금은 읽기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByLabelText('메시지')).toBeDisabled();
    expect(screen.getByLabelText('메시지')).toHaveAttribute('placeholder', '읽기 전용 대화예요');
  });

  it('보내다 실패하면 오류 문구를 보이고 글은 그대로 둔다', async () => {
    api.postThreadMessage.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: '잠시 후 다시 시도해 주세요.' } } } }),
    );
    renderPage();
    const input = await screen.findByLabelText('메시지');
    await userEvent.type(input, '안녕하세요');
    await userEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(input).toHaveValue('안녕하세요');
  });
});
