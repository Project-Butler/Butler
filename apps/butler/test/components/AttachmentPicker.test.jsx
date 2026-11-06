import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentPicker } from '../../src/landlord/web/components/AttachmentPicker/AttachmentPicker';
import { DocumentThumbnail } from '../../src/landlord/web/components/DocumentThumbnail/DocumentThumbnail';
import { useAttachmentUploads } from '../../src/landlord/web/hooks/useAttachmentUploads';

const api = vi.hoisted(() => ({
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));

vi.mock('@butler/api-client', () => api);

const apiError = (status, code, message = '오류') => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

// 화면처럼 훅 결과를 그대로 넘기고, 저장할 id를 같이 보여 준다.
const Harness = ({ initial = [] }) => {
  const uploads = useAttachmentUploads(initial);
  return (
    <>
      <AttachmentPicker uploads={uploads} />
      <output data-testid="ids">{uploads.documentIds.join(',')}</output>
      <output data-testid="uploading">{String(uploads.isUploading)}</output>
    </>
  );
};

const jpeg = (name = '욕실.jpg') => new File(['jpeg-bytes'], name, { type: 'image/jpeg' });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'http://api/upload', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  api.postDocument.mockResolvedValue({ id: 'doc-1' });
  api.deleteDocument.mockResolvedValue(undefined);
  api.postDocumentDownloadUrl.mockResolvedValue({ url: 'http://api/content/doc', expiresAt: '2026-11-04T00:05:00Z' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AttachmentPicker', () => {
  it('세션 → PUT → 미연결 등록 순서로 올리고, 저장할 문서 id를 모은다', async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), jpeg());

    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('doc-1'));
    expect(api.postUploadSession).toHaveBeenCalledWith({ fileName: '욕실.jpg', mimeType: 'image/jpeg', sizeBytes: 10, documentType: 'PHOTO' });
    expect(api.putUploadContent).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-1' }), expect.any(File), expect.any(Object));
    // 기록에 붙이는 건 저장할 때라 리소스 없이 등록한다
    expect(api.postDocument).toHaveBeenCalledWith({ uploadSessionId: 'session-1' });
    expect(screen.getByAltText('욕실.jpg')).toHaveAttribute('src', 'blob:preview');
  });

  it('허용 밖 형식은 올리지 않고 안내한다', async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), new File(['x'], 'a.gif', { type: 'image/gif' }), { applyAccept: false });
    expect(screen.getByText(/JPEG·PNG·WEBP·HEIC 사진과 PDF만/)).toBeInTheDocument();
    expect(api.postUploadSession).not.toHaveBeenCalled();
  });

  it('저장소를 쓸 수 없으면(503) "사진 첨부 준비 중"을 보이고 추가를 막는다', async () => {
    api.postUploadSession.mockRejectedValue(apiError(503, 'STORAGE_UNAVAILABLE'));
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), jpeg());

    expect(await screen.findByText(/사진 첨부 준비 중/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /사진 추가/ })).toBeDisabled();
    expect(screen.getByTestId('ids')).toHaveTextContent('');
    expect(screen.getByTestId('uploading')).toHaveTextContent('false');
  });

  it('이번에 올린 사진을 빼면 서버에서도 지우고, 원래 붙어 있던 사진은 저장할 때까지 남긴다', async () => {
    const existing = { id: 'old-doc', fileName: '기존.png', mimeType: 'image/png', sizeBytes: 100, isLocked: false };
    render(<Harness initial={[existing]} />);
    expect(screen.getByTestId('ids')).toHaveTextContent('old-doc');
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), jpeg());
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('old-doc,doc-1'));

    await userEvent.click(screen.getByRole('button', { name: '욕실.jpg 빼기' }));
    expect(api.deleteDocument).toHaveBeenCalledWith('doc-1');
    await userEvent.click(screen.getByRole('button', { name: '기존.png 빼기' }));
    expect(api.deleteDocument).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ids')).toHaveTextContent('');
  });

  it('올리는 중에 뺀 사진은 등록이 끝나면 바로 지운다', async () => {
    let resolveDocument;
    api.postDocument.mockReturnValue(new Promise((resolve) => (resolveDocument = resolve)));
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), jpeg());
    await waitFor(() => expect(api.postDocument).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: '욕실.jpg 빼기' }));
    expect(api.deleteDocument).not.toHaveBeenCalled();
    resolveDocument({ id: 'doc-late' });
    await waitFor(() => expect(api.deleteDocument).toHaveBeenCalledWith('doc-late'));
    expect(screen.getByTestId('ids')).toHaveTextContent('');
    expect(screen.getByTestId('uploading')).toHaveTextContent('false');
  });

  it('로그인이 풀리면(401) 올리는 중으로 남기지 않고 실패로 표시한다', async () => {
    api.postUploadSession.mockRejectedValue(apiError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.'));
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), jpeg());

    expect(await screen.findByText('로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByTestId('uploading')).toHaveTextContent('false');
  });

  it('잠긴 사진(넘어간 이력)은 뺄 수 없다', () => {
    render(<Harness initial={[{ id: 'locked', fileName: '이력.jpg', mimeType: 'image/jpeg', sizeBytes: 100, isLocked: true }]} />);
    expect(screen.queryByRole('button', { name: '이력.jpg 빼기' })).not.toBeInTheDocument();
  });
});

describe('DocumentThumbnail', () => {
  it('사진은 다운로드 URL로 띄우고, 로드에 실패하면 한 번만 다시 받는다', async () => {
    render(<DocumentThumbnail document={{ id: 'doc', fileName: '사진.jpg', mimeType: 'image/jpeg' }} />);
    const image = await screen.findByAltText('사진.jpg');
    expect(image).toHaveAttribute('src', 'http://api/content/doc');
    expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(1);

    image.dispatchEvent(new Event('error'));
    await waitFor(() => expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(2));
    (await screen.findByAltText('사진.jpg')).dispatchEvent(new Event('error'));
    expect(await screen.findByText('사진을 불러오지 못했어요')).toBeInTheDocument();
    expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it('HEIC·PDF는 썸네일 대신 다운로드 링크', async () => {
    render(<DocumentThumbnail document={{ id: 'heic', fileName: 'IMG.heic', mimeType: 'image/heic' }} />);
    const link = await screen.findByRole('link', { name: /다운로드/ });
    expect(link).toHaveAttribute('href', 'http://api/content/doc');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('원본을 열 때는 주소를 새로 받아 미리 연 창에 넣는다(만료된 주소를 열지 않게)', async () => {
    const opened = { opener: 'parent', location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(opened);
    render(<DocumentThumbnail document={{ id: 'doc', fileName: '사진.jpg', mimeType: 'image/jpeg' }} />);
    const link = (await screen.findByAltText('사진.jpg')).closest('a');
    expect(link).toHaveAttribute('href', 'http://api/content/doc');

    api.postDocumentDownloadUrl.mockResolvedValue({ url: 'http://api/content/fresh', expiresAt: '2026-11-04T00:10:00Z' });
    await userEvent.click(link);
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(opened.location.href).toBe('http://api/content/fresh'));
    expect(opened.opener).toBeNull();
    expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });
});
