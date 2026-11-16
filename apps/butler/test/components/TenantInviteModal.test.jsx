import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantInviteModal } from '../../src/landlord/web/components/TenantInviteModal/TenantInviteModal';

const api = vi.hoisted(() => ({
  getDocumentList: vi.fn(),
  postTenantInvitation: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));

vi.mock('@butler/api-client', () => api);

const apiError = (status, code, message = '오류') => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

const contract = {
  id: 'contract-1',
  property: { displayName: '잠실엘스 101동 1203호' },
  tenantName: '이세입',
  tenant: { phone: '01012344444' },
  startDate: '2026-12-01',
  endDate: '2028-11-30',
  isReadOnly: false,
};

const pdfs = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: `doc-${index + 1}`, fileName: `계약서_${String.fromCharCode(97 + index)}.pdf`, mimeType: 'application/pdf' }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getDocumentList.mockResolvedValue({ data: [], meta: {} });
  api.postDocumentDownloadUrl.mockResolvedValue({ url: 'https://files.test/x' });
});

describe('TenantInviteModal (임차인 초대 팝업)', () => {
  it('A1: 등록 요약(가린 연락처)을 보여 주고 [임차인 초대하기]로 A2에 간다', async () => {
    const onClose = vi.fn();
    render(<TenantInviteModal contract={contract} startStep="intro" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: '계약을 등록했어요' })).toBeInTheDocument();
    expect(screen.getByText('잠실엘스 101동 1203호')).toBeInTheDocument();
    expect(screen.getByText(/010-\*\*\*\*-4444/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '임차인 초대하기' }));
    expect(screen.getByText('1/2 · 함께 보여 줄 계약서')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '이전' }));
    await userEvent.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('A2c: 11번째를 고르면 팝업이 뜨고 선택되지 않는다. 한도 숫자는 팝업에만 있다', async () => {
    api.getDocumentList.mockResolvedValue({ data: pdfs(11), meta: {} });
    render(<TenantInviteModal contract={contract} onClose={vi.fn()} />);
    const boxes = await screen.findAllByRole('checkbox');
    expect(screen.getByRole('dialog').textContent).not.toMatch('10');
    for (const box of boxes.slice(0, 10)) await userEvent.click(box);
    await userEvent.click(boxes[10]);
    const alert = screen.getByRole('alertdialog');
    expect(within(alert).getByText('계약서는 10개까지 공유할 수 있어요')).toBeInTheDocument();
    expect(boxes[10]).not.toBeChecked();
    await userEvent.click(within(alert).getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('[링크 만들기] → A3 링크 복사 안내', async () => {
    api.getDocumentList.mockResolvedValue({ data: pdfs(2), meta: {} });
    api.postTenantInvitation.mockResolvedValue({
      id: 'inv-1',
      inviteUrl: 'https://butler.test/invite/abc',
      expiresAt: '2026-11-18T05:00:00.000Z',
      status: 'PENDING',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onInvited = vi.fn();
    render(<TenantInviteModal contract={contract} onClose={vi.fn()} onInvited={onInvited} />);
    const [first] = await screen.findAllByRole('checkbox');
    await userEvent.click(first);
    await userEvent.click(screen.getByRole('button', { name: '링크 만들기' }));
    expect(api.postTenantInvitation).toHaveBeenCalledWith('contract-1', { sharedDocumentIds: ['doc-1'] });
    expect(await screen.findByText('2/2 · 링크를 보내 주세요')).toBeInTheDocument();
    expect(onInvited).toHaveBeenCalled();
    expect(screen.getByText(/2026\.11\.18까지/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    expect(writeText).toHaveBeenCalledWith('https://butler.test/invite/abc');
    expect(await screen.findByText('복사했어요. 문자나 카카오톡에 붙여 넣어 이세입 님에게 보내세요.')).toBeInTheDocument();
  });

  it('409·422 오류는 메시지 박스로 보여 준다', async () => {
    api.postTenantInvitation.mockRejectedValue(apiError(409, 'INVITATION_ALREADY_ACCEPTED', '이미 앱에 연결된 계약이에요.'));
    render(<TenantInviteModal contract={contract} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getDocumentList).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: '링크 만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 앱에 연결된 계약이에요.');
  });

  it('새로 올린 계약서는 CONTRACT_DOCUMENT로 계약에 붙이고 바로 선택한다', async () => {
    api.postUploadSession.mockResolvedValue({ id: 'up-1', uploadUrl: 'https://upload.test' });
    api.putUploadContent.mockResolvedValue(undefined);
    api.postDocument.mockResolvedValue({ id: 'new-doc', fileName: 'new.pdf', mimeType: 'application/pdf' });
    const { container } = render(<TenantInviteModal contract={contract} onClose={vi.fn()} />);
    await waitFor(() => expect(api.getDocumentList).toHaveBeenCalled());
    const input = container.ownerDocument.querySelector('input[type="file"][accept*="application/pdf"]');
    await userEvent.upload(input, new File(['%PDF'], 'new.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(api.postUploadSession).toHaveBeenCalledWith(expect.objectContaining({ documentType: 'CONTRACT_DOCUMENT', mimeType: 'application/pdf' }));
    expect(api.postDocument).toHaveBeenCalledWith({ uploadSessionId: 'up-1', resourceType: 'CONTRACT', resourceId: 'contract-1' });
  });
});
