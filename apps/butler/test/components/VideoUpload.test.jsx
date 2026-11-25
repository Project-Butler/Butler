import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentPicker } from '../../src/landlord/web/components/AttachmentPicker/AttachmentPicker';
import { useAttachmentUploads } from '../../src/shared/upload/useAttachmentUploads';
import { resetUploadRulesCache } from '../../src/shared/upload/useGetUploadRules';
import { DocumentViewer } from '../../src/shared/documentViewer/DocumentViewer';

const MB = 1024 * 1024;
// 서버(GET /files/upload-rules) 기본값과 같은 모양
const RULES = {
  kinds: {
    IMAGE: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], maxBytes: 20 * MB },
    PDF: { mimeTypes: ['application/pdf'], extensions: ['pdf'], maxBytes: 20 * MB },
    VIDEO: { mimeTypes: ['video/mp4', 'video/quicktime'], extensions: ['mp4', 'mov', 'm4v'], maxBytes: 50 * MB },
  },
  resourceKinds: { TICKET: ['IMAGE', 'PDF', 'VIDEO'], CONTRACT: ['IMAGE', 'PDF', 'VIDEO'], OWNERSHIP: ['IMAGE', 'PDF', 'VIDEO'], MANAGEMENT_LOG: ['IMAGE', 'PDF'] },
  uploadSessionTtlMs: { IMAGE: 900000, PDF: 900000, VIDEO: 1800000 },
  viewUrlTtlMs: { IMAGE: 300000, PDF: 300000, VIDEO: 3600000 },
};

const api = vi.hoisted(() => ({
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const Harness = ({ resourceType }) => {
  const uploads = useAttachmentUploads([], { resourceType });
  return (
    <>
      <AttachmentPicker uploads={uploads} />
      <output data-testid="ids">{uploads.documentIds.join(',')}</output>
    </>
  );
};

// 큰 파일은 실제로 만들지 않고 size만 바꾼다.
const fileOf = (name, type, size = 1000) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  resetUploadRulesCache();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  api.getUploadRules.mockResolvedValue(RULES);
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'http://api/upload', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  api.postDocument.mockResolvedValue({ id: 'doc-1' });
  api.postDocumentDownloadUrl.mockResolvedValue({ url: 'http://api/content/doc', expiresAt: '2026-11-20T01:00:00Z' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('수리 요청 첨부(resourceType TICKET)', () => {
  it('업로드 규칙을 받으면 동영상도 고를 수 있고, 세션에 targetResourceType을 보낸다', async () => {
    render(<Harness resourceType="TICKET" />);
    expect(await screen.findByRole('button', { name: /사진·동영상 추가/ })).toBeInTheDocument();
    expect(screen.getByText('JPEG·PNG·WEBP·HEIC 사진과 PDF는 20MB, MP4·MOV 동영상은 50MB까지 붙일 수 있어요.')).toBeInTheDocument();
    expect(screen.getByLabelText('사진 파일 선택').getAttribute('accept')).toContain('video/mp4');

    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), fileOf('누수.mov', 'video/quicktime', 30 * MB));
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('doc-1'));
    expect(api.postUploadSession).toHaveBeenCalledWith({
      fileName: '누수.mov',
      mimeType: 'video/quicktime',
      sizeBytes: 30 * MB,
      documentType: 'PHOTO',
      targetResourceType: 'TICKET',
    });
  });

  it('50MB를 넘는 동영상은 고르는 순간 안내하고 올리지 않는다', async () => {
    render(<Harness resourceType="TICKET" />);
    await screen.findByRole('button', { name: /사진·동영상 추가/ });
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), fileOf('긴 영상.mp4', 'video/mp4', 50 * MB + 1));
    expect(await screen.findByText(/긴 영상\.mp4: 동영상은 50MB까지 올릴 수 있어요/)).toBeInTheDocument();
    expect(api.postUploadSession).not.toHaveBeenCalled();
  });

  it('규칙을 받지 못하면 지금처럼 사진·PDF만(동영상 거절)', async () => {
    api.getUploadRules.mockRejectedValue(new Error('network'));
    render(<Harness resourceType="TICKET" />);
    await waitFor(() => expect(api.getUploadRules).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '사진 추가' })).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), fileOf('a.mp4', 'video/mp4'), { applyAccept: false });
    expect(await screen.findByText(/JPEG·PNG·WEBP·HEIC 사진과 PDF만 올릴 수 있어요/)).toBeInTheDocument();
    expect(api.postUploadSession).not.toHaveBeenCalled();
  });
});

describe('하우스 로그 첨부(resourceType 없음)', () => {
  it('규칙을 받아도 동영상은 고를 수 없고, 세션에 targetResourceType을 넣지 않는다', async () => {
    render(<Harness />);
    await waitFor(() => expect(api.getUploadRules).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '사진 추가' })).toBeInTheDocument();
    expect(screen.getByLabelText('사진 파일 선택').getAttribute('accept')).not.toContain('video');
    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), fileOf('a.mp4', 'video/mp4'), { applyAccept: false });
    expect(await screen.findByText(/사진과 PDF만 올릴 수 있어요/)).toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText('사진 파일 선택'), fileOf('a.jpg', 'image/jpeg'));
    await waitFor(() => expect(api.postUploadSession).toHaveBeenCalled());
    expect(api.postUploadSession.mock.calls[0][0]).not.toHaveProperty('targetResourceType');
  });
});

describe('뷰어 동영상 재생', () => {
  const video = { id: 'v1', fileName: '입주.mp4', mimeType: 'video/mp4', sizeBytes: 2 * MB };
  const makeUrls = (overrides = {}) => {
    const entries = {};
    const urls = {
      entries,
      load: vi.fn(async (id) => {
        entries[id] = { url: `http://files/${id}?n=${urls.load.mock.calls.length}`, status: 'ready' };
        return entries[id].url;
      }),
      open: vi.fn(async () => true),
      save: vi.fn(async () => true),
      reportError: vi.fn(),
      retry: vi.fn(),
      ...overrides,
    };
    return urls;
  };

  it('지금 칸이 동영상이면 VIEW 주소(60분 유효)를 받아 <video>로 재생한다', async () => {
    const urls = makeUrls();
    urls.entries.v1 = { url: 'http://files/v1', status: 'ready' };
    const { container } = render(<DocumentViewer documents={[video]} urls={urls} onClose={() => {}} />);
    expect(urls.load).toHaveBeenCalledWith('v1', { purpose: 'VIEW', freshMs: 55 * 60 * 1000 });
    const element = container.querySelector('video');
    expect(element.getAttribute('src').startsWith('http://files/v1')).toBe(true);
    expect(element).toHaveAttribute('controls');
    expect(element).toHaveAttribute('preload', 'metadata');
    expect(screen.getByText('재생이 안 되면 [저장]으로 내려받아 보세요')).toBeInTheDocument();
  });

  it('형식·코덱을 지원하지 않으면(MediaError 4) 다시 받지 않고 대체 화면', async () => {
    const urls = makeUrls();
    urls.entries.v1 = { url: 'http://files/v1', status: 'ready' };
    const { container } = render(<DocumentViewer documents={[video]} urls={urls} onClose={() => {}} />);
    const element = container.querySelector('video');
    Object.defineProperty(element, 'error', { value: { code: 4 } });
    fireEvent.error(element);
    expect(await screen.findByText('이 브라우저에서 재생할 수 없어요')).toBeInTheDocument();
    expect(urls.load).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '내려받기' }));
    expect(urls.save).toHaveBeenCalledWith(video);
    await userEvent.click(screen.getByRole('button', { name: '새 탭에서 열기' }));
    expect(urls.open).toHaveBeenCalledWith(video);
  });

  it('재생 중 오류(주소 만료 등)는 주소를 한 번만 다시 받고, 또 실패하면 대체 화면', async () => {
    const urls = makeUrls();
    urls.entries.v1 = { url: 'http://files/v1', status: 'ready' };
    const { container, rerender } = render(<DocumentViewer documents={[video]} urls={urls} onClose={() => {}} />);
    const first = container.querySelector('video');
    Object.defineProperty(first, 'error', { value: { code: 2 } });
    await act(async () => {
      fireEvent.error(first);
    });
    expect(urls.load).toHaveBeenLastCalledWith('v1', { force: true });
    rerender(<DocumentViewer documents={[video]} urls={{ ...urls }} onClose={() => {}} />);
    const second = container.querySelector('video');
    Object.defineProperty(second, 'error', { value: { code: 2 } });
    fireEvent.error(second);
    expect(await screen.findByText('이 브라우저에서 재생할 수 없어요')).toBeInTheDocument();
    expect(urls.load.mock.calls.filter(([, options]) => options?.force)).toHaveLength(1);
  });
});
