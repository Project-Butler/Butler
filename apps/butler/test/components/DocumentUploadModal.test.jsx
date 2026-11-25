import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentUploadModal } from '../../src/landlord/web/components/DocumentUploadModal/DocumentUploadModal';

const api = vi.hoisted(() => ({
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
}));

vi.mock('@butler/api-client', () => api);

const apiError = (status, code, message = '오류') => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

const contract = (patch = {}) => ({
  id: 'contract-1',
  ownershipId: 'ownership-1',
  tenantName: '이세입',
  startDate: '2025-03-02',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  isUploadable: true,
  documents: [],
  ...patch,
});

const makeBox = ({ ownership = {}, contracts = [contract()] } = {}) => ({
  property: { id: 'p-1', displayName: '잠실엘스 101동 1203호' },
  documentCount: 0,
  ownerships: [{ id: 'ownership-1', isActive: true, verificationStatus: 'VERIFIED', isUploadable: true, documents: [], ...ownership }],
  contracts,
});

const pdf = (name, size = 1024) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

const renderModal = (props = {}) => {
  const handlers = { onClose: vi.fn(), onUploaded: vi.fn(), onUnauthorized: vi.fn() };
  render(<DocumentUploadModal box={makeBox()} propertyName="잠실엘스 101동 1203호" {...handlers} {...props} />);
  return { ...handlers, fileInput: () => document.querySelector('input[type="file"]') };
};

beforeEach(() => {
  vi.clearAllMocks();
  api.postUploadSession.mockResolvedValue({ id: 'session-1', uploadUrl: 'https://files.test/up', method: 'PUT', headers: {} });
  api.putUploadContent.mockResolvedValue(undefined);
  api.postDocument.mockResolvedValue({ id: 'doc-1' });
});

describe('DocumentUploadModal (문서 업로드 팝업)', () => {
  it('미리 고른 곳과 종류 칩을 보여 준다. 보관할 곳을 바꾸면 첫 종류로 돌아간다', async () => {
    renderModal({ initialTarget: 'CONTRACT' });
    expect(screen.getByRole('button', { name: /계약 문서/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '계약서·특약' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '영수증' }));
    expect(screen.getByRole('button', { name: '영수증' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /내 소유 문서/ }));
    expect(screen.getByRole('button', { name: '등기부' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '영수증' })).not.toBeInTheDocument();
  });

  it('미인증·끝난 소유 호실도 내 소유 문서를 고를 수 있고 인증 안내는 없다(2026-11-20)', () => {
    renderModal({ box: makeBox({ ownership: { isActive: false, isUploadable: true, verificationStatus: 'UNVERIFIED' } }) });
    expect(screen.getByRole('button', { name: /내 소유 문서/ })).toBeEnabled();
    expect(screen.queryByText(/권리자 인증 후/)).not.toBeInTheDocument();
  });

  it('고른 직후는 대기이고 서버를 부르지 않는다. 20MB를 넘는 파일은 안내만 한다', async () => {
    const { fileInput } = renderModal({ initialTarget: 'OWNERSHIP' });
    await userEvent.upload(fileInput(), [pdf('등기부.pdf'), pdf('큰파일.pdf', 21 * 1024 * 1024)]);
    expect(screen.getByText('등기부.pdf')).toBeInTheDocument();
    expect(screen.getByText('대기')).toBeInTheDocument();
    expect(screen.getByText(/큰파일\.pdf: 한 파일은 20MB까지/)).toBeInTheDocument();
    expect(api.postUploadSession).not.toHaveBeenCalled();
  });

  it('한 번에 10개까지만 담는다', async () => {
    const { fileInput } = renderModal({ initialTarget: 'OWNERSHIP' });
    await userEvent.upload(fileInput(), Array.from({ length: 11 }, (_, index) => pdf(`문서${index + 1}.pdf`)));
    expect(screen.getAllByText('대기')).toHaveLength(10);
    expect(screen.getByText(/10개만 담았어요/)).toBeInTheDocument();
  });

  it('남은 자리(30 − 지금 수)만큼만 담는다', async () => {
    const documents = Array.from({ length: 28 }, (_, index) => ({ id: `d${index}` }));
    const { fileInput } = renderModal({ box: makeBox({ ownership: { documents } }), initialTarget: 'OWNERSHIP' });
    await userEvent.upload(fileInput(), [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    expect(screen.getAllByText('대기')).toHaveLength(2);
  });

  it('[저장]하면 세션 → 올리기 → 연결 순서로 올리고 모두 올라가면 닫는다', async () => {
    const { fileInput, onClose, onUploaded } = renderModal({ initialTarget: 'CONTRACT', initialContractId: 'contract-1' });
    await userEvent.click(screen.getByRole('button', { name: '신고필증·확정일자' }));
    await userEvent.upload(fileInput(), pdf('신고필증.pdf'));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // 붙일 곳(targetResourceType)을 세션에 함께 보낸다(서버가 그 곳이 받는 형식·크기를 바로 확인)
    expect(api.postUploadSession).toHaveBeenCalledWith({
      fileName: '신고필증.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'LEASE_REPORT',
      targetResourceType: 'CONTRACT',
    });
    expect(api.postDocument).toHaveBeenCalledWith({ uploadSessionId: 'session-1', resourceType: 'CONTRACT', resourceId: 'contract-1' });
    expect(onUploaded).toHaveBeenCalledWith(1);
  });

  it('일부 실패하면 닫지 않고 실패한 파일만 남긴다', async () => {
    api.postDocument.mockResolvedValueOnce({ id: 'doc-1' }).mockRejectedValueOnce(apiError(422, 'ATTACHMENT_LIMIT_EXCEEDED', '문서는 30개까지 올릴 수 있어요.'));
    const { fileInput, onClose, onUploaded } = renderModal({ initialTarget: 'OWNERSHIP' });
    await userEvent.upload(fileInput(), [pdf('첫째.pdf'), pdf('둘째.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('문서는 30개까지 올릴 수 있어요.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUploaded).toHaveBeenCalledWith(1);
    expect(screen.queryByText('첫째.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('둘째.pdf')).toBeInTheDocument();
  });

  it('저장소를 쓸 수 없으면(503 STORAGE_UNAVAILABLE) 안내하고 나머지는 시도하지 않는다', async () => {
    api.postUploadSession.mockRejectedValue(apiError(503, 'STORAGE_UNAVAILABLE', '저장소 오류'));
    const { fileInput, onClose } = renderModal({ initialTarget: 'OWNERSHIP' });
    await userEvent.upload(fileInput(), [pdf('a.pdf'), pdf('b.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findAllByText(/지금은 파일을 올릴 수 없어요/)).not.toHaveLength(0);
    expect(api.postUploadSession).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
  });

  it('401이면 onUnauthorized를 부른다', async () => {
    api.postUploadSession.mockRejectedValue(apiError(401, 'UNAUTHORIZED'));
    const { fileInput, onUnauthorized } = renderModal({ initialTarget: 'OWNERSHIP' });
    await userEvent.upload(fileInput(), pdf('a.pdf'));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
