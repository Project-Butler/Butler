// 공용 대화 입력 상태(shared/threads/useThreadComposer) — 글·첨부 보내기 조건과 보낸 뒤 비우기(docs/19 11-2).
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadComposer } from '../../../src/shared/threads/useThreadComposer';
import { ThreadComposer } from '../../../src/shared/threads/ThreadComposer';

const api = vi.hoisted(() => ({
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const apiError = (status, code, message = '오류') =>
  Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

let latest;
// 대화 훅 대신 필요한 값만 가진 가짜 conversation 을 넘긴다.
const Probe = ({ conversation, showAttach = true, showCounter = false }) => {
  const composer = useThreadComposer(conversation, { attachEnabled: showAttach });
  latest = composer;
  return (
    <form onSubmit={composer.submit}>
      <ThreadComposer composer={composer} showAttach={showAttach} showCounter={showCounter} />
      <output data-testid="error">{composer.errorText ?? ''}</output>
    </form>
  );
};

const conversationOf = (overrides = {}) => ({
  thread: { id: 't1', isReadOnly: false },
  sendMessage: vi.fn(async () => true),
  isSending: false,
  sendError: null,
  ...overrides,
});

const jpeg = (name) => new File(['jpeg-bytes'], name, { type: 'image/jpeg' });
const sendButton = () => screen.getByRole('button', { name: '보내기' });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  api.getUploadRules.mockRejectedValue(new Error('규칙 없음'));
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'http://api/upload', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  let seq = 0;
  api.postDocument.mockImplementation(async () => {
    seq += 1;
    return { id: `doc-${seq}` };
  });
  api.deleteDocument.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  latest = undefined;
});

describe('useThreadComposer', () => {
  it('글이 없고 첨부도 없으면 보낼 수 없다', () => {
    render(<Probe conversation={conversationOf()} />);
    expect(sendButton()).toBeDisabled();
  });

  it('글만 보내면 지금처럼 문자열을 넘기고, 성공하면 입력칸을 비운다', async () => {
    const conversation = conversationOf();
    render(<Probe conversation={conversation} />);
    await userEvent.type(screen.getByLabelText('메시지'), '  안녕하세요  ');
    await userEvent.click(sendButton());
    expect(conversation.sendMessage).toHaveBeenCalledWith('안녕하세요');
    await waitFor(() => expect(screen.getByLabelText('메시지')).toHaveValue(''));
  });

  it('첨부만으로도 보낼 수 있고, 업로드 세션은 THREAD_MESSAGE 로 연다', async () => {
    const conversation = conversationOf();
    render(<Probe conversation={conversation} />);
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    await waitFor(() => expect(latest.uploads.documentIds).toEqual(['doc-1', 'doc-2']));
    expect(api.postUploadSession).toHaveBeenCalledWith(expect.objectContaining({ targetResourceType: 'THREAD_MESSAGE' }));

    await userEvent.click(sendButton());
    expect(conversation.sendMessage).toHaveBeenCalledWith({ body: '', attachmentDocumentIds: ['doc-1', 'doc-2'] });
  });

  it('보낸 뒤 첨부 줄을 비우고(clear), 이미 붙은 문서는 지우지 않는다', async () => {
    render(<Probe conversation={conversationOf()} />);
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    await waitFor(() => expect(latest.uploads.documentIds).toEqual(['doc-1']));
    await userEvent.click(sendButton());
    await waitFor(() => expect(latest.uploads.items).toHaveLength(0));
    expect(api.deleteDocument).not.toHaveBeenCalled();
  });

  it('6번째 파일은 붙이지 않고 메시지용 안내를 보인다', async () => {
    render(<Probe conversation={conversationOf()} />);
    const files = ['1', '2', '3', '4', '5', '6'].map((n) => jpeg(`${n}.jpg`));
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), files);
    expect(screen.getByText('첨부는 메시지 하나에 5개까지 보낼 수 있어요.')).toBeInTheDocument();
    expect(latest.uploads.items).toHaveLength(5);
  });

  it('올리는 중이거나 실패한 칸이 있으면 보낼 수 없다', async () => {
    let finish;
    api.putUploadContent.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    render(<Probe conversation={conversationOf()} />);
    await userEvent.type(screen.getByLabelText('메시지'), '사진 보내요');
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    expect(sendButton()).toBeDisabled();

    api.postDocument.mockRejectedValue(apiError(422, 'FILE_TYPE_NOT_ALLOWED', '형식이 맞지 않아요'));
    await act(async () => finish());
    await waitFor(() => expect(latest.uploads.hasFailed).toBe(true));
    expect(sendButton()).toBeDisabled();
  });

  it('보내기에 실패하면 글과 첨부를 그대로 두고, 첨부를 못 찾으면 다시 고르라고 한다', async () => {
    const conversation = conversationOf({
      sendMessage: vi.fn(async () => false),
      sendError: { code: 'DOCUMENT_NOT_FOUND', message: '문서를 찾을 수 없습니다.' },
    });
    render(<Probe conversation={conversation} />);
    await userEvent.type(screen.getByLabelText('메시지'), '영수증');
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    await waitFor(() => expect(latest.uploads.documentIds).toEqual(['doc-1']));
    await userEvent.click(sendButton());

    expect(screen.getByLabelText('메시지')).toHaveValue('영수증');
    expect(latest.uploads.items).toHaveLength(1);
    expect(screen.getByTestId('error')).toHaveTextContent('첨부를 다시 골라 주세요.');
  });

  it('보내는 중이면 입력칸·첨부·보내기가 모두 막힌다', () => {
    render(<Probe conversation={conversationOf({ isSending: true })} />);
    expect(screen.getByLabelText('메시지')).toBeDisabled();
    expect(screen.getByRole('button', { name: '사진·파일 첨부' })).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it('끝난 대화(읽기 전용)가 되면 올려 둔 미연결 문서를 지운다', async () => {
    const conversation = conversationOf();
    const { rerender } = render(<Probe conversation={conversation} />);
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    await waitFor(() => expect(latest.uploads.documentIds).toEqual(['doc-1']));

    rerender(<Probe conversation={{ ...conversation, thread: { id: 't1', isReadOnly: true } }} />);
    await waitFor(() => expect(api.deleteDocument).toHaveBeenCalledWith('doc-1'));
    expect(latest.uploads.items).toHaveLength(0);
    expect(screen.getByLabelText('메시지')).toBeDisabled();
    expect(screen.getByLabelText('메시지')).toHaveAttribute('placeholder', '읽기 전용 대화예요');
  });
});

describe('ThreadComposer', () => {
  it('showAttach 가 없으면 [사진] 버튼도 첨부 칸도 없고, 업로드 규칙도 받지 않는다(지금 앱 대화 화면 그대로)', () => {
    render(<Probe conversation={conversationOf()} showAttach={false} />);
    expect(screen.queryByRole('button', { name: '사진·파일 첨부' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('첨부 파일 선택')).not.toBeInTheDocument();
    expect(api.getUploadRules).not.toHaveBeenCalled();
  });

  it('showCounter 를 켜지 않으면 남은 글자 수를 보이지 않는다', () => {
    render(<Probe conversation={conversationOf()} showAttach={false} />);
    act(() => latest.setDraft('가'.repeat(1990)));
    expect(screen.queryByText(/남은 글자/)).not.toBeInTheDocument();
  });

  it('입력칸은 2,000자까지 받고, showCounter 면 100자 이하로 남을 때 남은 글자 수를 보인다', async () => {
    render(<Probe conversation={conversationOf()} showAttach={false} showCounter />);
    const input = screen.getByLabelText('메시지');
    expect(input).toHaveAttribute('maxLength', '2000');
    expect(screen.queryByText(/남은 글자/)).not.toBeInTheDocument();

    act(() => latest.setDraft('가'.repeat(1950)));
    expect(screen.getByText('남은 글자 50')).toBeInTheDocument();
  });

  it('2,000자를 넘는 글(붙여 넣기 등)은 보낼 수 없다', () => {
    render(<Probe conversation={conversationOf()} showAttach={false} />);
    act(() => latest.setDraft('가'.repeat(2001)));
    expect(sendButton()).toBeDisabled();
  });

  it('첨부 줄: 올리는 중이면 진행 막대, [×]로 빼면 그 문서를 지운다', async () => {
    let finish;
    api.putUploadContent.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    render(<Probe conversation={conversationOf()} />);
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), jpeg('a.jpg'));
    expect(screen.getByRole('progressbar', { name: 'a.jpg 올리는 중' })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    await act(async () => finish());
    await waitFor(() => expect(latest.uploads.documentIds).toEqual(['doc-1']));
    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 빼기' }));
    expect(api.deleteDocument).toHaveBeenCalledWith('doc-1');
    expect(screen.queryByRole('list', { name: '보낼 첨부' })).not.toBeInTheDocument();
  });

  it('서버 규칙이 대화에 동영상을 받으면 [사진·파일 첨부]가 MP4·MOV 도 고른다', async () => {
    api.getUploadRules.mockResolvedValue({
      kinds: {
        IMAGE: { mimeTypes: ['image/jpeg'], extensions: ['jpg'], maxBytes: 20 * 1024 * 1024 },
        PDF: { mimeTypes: ['application/pdf'], extensions: ['pdf'], maxBytes: 20 * 1024 * 1024 },
        VIDEO: { mimeTypes: ['video/mp4', 'video/quicktime'], extensions: ['mp4', 'mov'], maxBytes: 50 * 1024 * 1024 },
      },
      resourceKinds: { THREAD_MESSAGE: ['IMAGE', 'PDF', 'VIDEO'] },
    });
    const { resetUploadRulesCache } = await import('../../../src/shared/upload/useGetUploadRules');
    resetUploadRulesCache();
    render(<Probe conversation={conversationOf()} />);
    await waitFor(() => expect(screen.getByLabelText('첨부 파일 선택').getAttribute('accept')).toContain('video/mp4'));
    await userEvent.upload(screen.getByLabelText('첨부 파일 선택'), new File(['mp4'], '누수.mp4', { type: 'video/mp4' }));
    expect(api.postUploadSession).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'video/mp4', targetResourceType: 'THREAD_MESSAGE' }));
    resetUploadRulesCache();
  });
});
