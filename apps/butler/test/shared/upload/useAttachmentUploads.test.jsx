// 공용 첨부 업로드 훅의 clear()·countNotice(대화 메시지 첨부용, docs/19 10-4).
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttachmentUploads } from '../../../src/shared/upload/useAttachmentUploads';

const api = vi.hoisted(() => ({
  getUploadRules: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('@butler/api-client', () => api);

let latest;
const Probe = ({ options }) => {
  const uploads = useAttachmentUploads([], options);
  latest = uploads;
  return (
    <>
      <input type="file" multiple aria-label="파일" onChange={(event) => uploads.addFiles(event.target.files)} />
      <output data-testid="count">{uploads.items.length}</output>
      <output data-testid="notice">{uploads.notice ?? ''}</output>
    </>
  );
};

const jpeg = (name) => new File(['jpeg-bytes'], name, { type: 'image/jpeg' });

beforeEach(() => {
  let seq = 0;
  URL.createObjectURL = vi.fn(() => {
    seq += 1;
    return `blob:preview-${seq}`;
  });
  URL.revokeObjectURL = vi.fn();
  api.getUploadRules.mockRejectedValue(new Error('규칙 없음'));
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'http://api/upload', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  let docSeq = 0;
  api.postDocument.mockImplementation(async () => {
    docSeq += 1;
    return { id: `doc-${docSeq}` };
  });
  api.deleteDocument.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  latest = undefined;
});

describe('useAttachmentUploads.clear()', () => {
  it('보낸 뒤 비우기: 칸을 모두 비우고 미리보기 주소를 돌려주며, 서버 문서는 지우지 않는다', async () => {
    render(<Probe options={{ maxCount: 5 }} />);
    await userEvent.upload(screen.getByLabelText('파일'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    await waitFor(() => expect(latest.documentIds).toEqual(['doc-1', 'doc-2']));

    act(() => latest.clear());

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(latest.documentIds).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
    expect(api.deleteDocument).not.toHaveBeenCalled();
  });

  it('안내 문구도 지운다', async () => {
    render(<Probe options={{ maxCount: 1 }} />);
    await userEvent.upload(screen.getByLabelText('파일'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    await waitFor(() => expect(screen.getByTestId('notice')).not.toHaveTextContent(''));
    await waitFor(() => expect(latest.isUploading).toBe(false));

    act(() => latest.clear());
    expect(screen.getByTestId('notice')).toHaveTextContent('');
  });
});

describe('useAttachmentUploads countNotice', () => {
  it('주지 않으면 지금 문구(하우스 로그) 그대로', async () => {
    render(<Probe options={{ maxCount: 1 }} />);
    await userEvent.upload(screen.getByLabelText('파일'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(screen.getByTestId('notice')).toHaveTextContent('사진은 기록 하나에 1장까지 붙일 수 있어요.');
  });

  it('문자열이면 그 문구, 함수면 최대 개수를 넣어 부른 결과를 쓴다', async () => {
    const { unmount } = render(<Probe options={{ maxCount: 1, countNotice: '첨부는 메시지 하나에 5개까지 보낼 수 있어요.' }} />);
    await userEvent.upload(screen.getByLabelText('파일'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(screen.getByTestId('notice')).toHaveTextContent('첨부는 메시지 하나에 5개까지 보낼 수 있어요.');
    unmount();

    render(<Probe options={{ maxCount: 2, countNotice: (max) => `최대 ${max}개` }} />);
    await userEvent.upload(screen.getByLabelText('파일'), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
    expect(screen.getByTestId('notice')).toHaveTextContent('최대 2개');
    // 넘친 파일은 붙지 않는다
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });
});
