import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentBoxPage } from '../../src/landlord/web/pages/DocumentBoxPage';
import { isPreviewableDocument } from '../../src/landlord/web/components/DocumentPreviewModal/DocumentPreviewModal';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getPropertyList: vi.fn(),
  getPropertyDocumentBox: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  deleteDocument: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
}));

vi.mock('@butler/api-client', () => api);

const ME = 'user-1';
const property = (id, name, patch = {}) => ({
  id,
  displayName: name,
  status: 'LEASED',
  documentCount: 2,
  myRelation: { type: 'OWNER', ownershipId: `o-${id}`, verificationStatus: 'VERIFIED' },
  ...patch,
});
const doc = (id, patch = {}) => ({
  id,
  documentType: 'OTHER',
  fileName: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  isLocked: false,
  uploaderId: ME,
  createdAt: '2026-10-14T08:00:00Z',
  ...patch,
});
const contract = (id, patch = {}) => ({
  id,
  ownershipId: 'o-p1',
  tenantName: `임차인${id}`,
  startDate: '2025-03-02',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  isUploadable: true,
  documents: [],
  ...patch,
});
const makeBox = (patch = {}) => ({
  property: { id: 'p1', displayName: '잠실엘스 101동 1203호' },
  documentCount: 2,
  ownerships: [
    {
      id: 'o-p1',
      isActive: true,
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: null,
      verificationStatus: 'VERIFIED',
      isUploadable: true,
      documents: [doc('등기부', { resourceType: 'OWNERSHIP', documentType: 'REGISTRY_CERTIFICATE' })],
    },
  ],
  contracts: [],
  ...patch,
});
const apiError = (status, code, message) => Object.assign(new Error(message), { response: { status, data: { error: { code, message } } } });

const former = (id, name) => property(id, name, { myRelation: { type: 'FORMER_OWNER', ownershipId: `o-${id}` } });

const setupLists = ({ owners = [property('p1', '잠실엘스 101동 1203호')], formers = [] } = {}) => {
  api.getPropertyList.mockImplementation(async ({ relation }) => ({ data: relation === 'OWNER' ? owners : formers, meta: { hasNext: false } }));
};

const renderPage = (props = {}) => {
  const onNavigate = vi.fn();
  render(<DocumentBoxPage propertyId="p1" userId={ME} onNavigate={onNavigate} {...props} />);
  return { onNavigate };
};

beforeEach(() => {
  vi.clearAllMocks();
  setupLists();
  api.getPropertyDocumentBox.mockResolvedValue(makeBox());
  api.postDocumentDownloadUrl.mockResolvedValue({ url: 'https://files.test/x' });
});

describe('DocumentBoxPage (문서함)', () => {
  it('호실 목록과 내 소유 문서 표를 보여 주고 올릴 수 있으면 [문서 업로드]가 있다', async () => {
    renderPage();
    expect(await screen.findByText('등기부.pdf')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '호실' })).toHaveTextContent('잠실엘스 101동 1203호');
    expect(screen.getByRole('button', { name: '문서 업로드' })).toBeInTheDocument();
  });

  it('같은 단지 호실이 여럿이어도 동·호를 첫 줄에 따로 보여 서로 구별된다', async () => {
    const unit = (id, unitNo) =>
      property(id, `E2E 서류함 단지 101동 ${unitNo}호`, { buildingNo: '101', unitNo, complex: { name: 'E2E 서류함 단지' } });
    setupLists({ owners: [unit('p1', '1001'), unit('p2', '1002')] });
    renderPage();
    const nav = await screen.findByRole('navigation', { name: '호실' });
    expect(within(nav).getByText('101동 1001호')).toBeInTheDocument();
    expect(within(nav).getByText('101동 1002호')).toBeInTheDocument();
    expect(within(nav).getAllByText('E2E 서류함 단지')).toHaveLength(2);
    expect(within(nav).getByText('101동 1001호').closest('button')).toHaveAttribute('title', 'E2E 서류함 단지 101동 1001호');
  });

  it('호실이 하나도 없으면 빈 상태와 [부동산 등록]', async () => {
    setupLists({ owners: [], formers: [] });
    const { onNavigate } = renderPage({ propertyId: undefined });
    expect(await screen.findByText('등록한 부동산이 없어요')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '부동산 등록' }));
    expect(onNavigate).toHaveBeenCalledWith('propertyRegister');
  });

  it('주소에 호실이 없으면 첫 호실을 고르고 주소를 바꾼다(안내 없음)', async () => {
    const { onNavigate } = renderPage({ propertyId: undefined });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('documents', { propertyId: 'p1' }, { replace: true }));
    expect(screen.queryByText(/찾을 수 없는 호실/)).not.toBeInTheDocument();
  });

  it('남의 호실 id면 첫 호실로 바꾸고 안내한다', async () => {
    const { onNavigate } = renderPage({ propertyId: 'someone-else' });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('documents', { propertyId: 'p1' }, { replace: true }));
    expect(await screen.findByText('찾을 수 없는 호실이라 첫 호실을 열었어요.')).toBeInTheDocument();
  });

  // 목록 응답을 손으로 끝내는 도구. relation별로 resolve를 꺼내 쓴다
  const deferLists = ({ owners = [property('p1', '잠실엘스 101동 1203호')], deferOwners = false } = {}) => {
    const pending = {};
    api.getPropertyList.mockImplementation(({ relation }) => {
      if (relation === 'OWNER' && !deferOwners) return Promise.resolve({ data: owners, meta: { hasNext: false } });
      return new Promise((resolve) => {
        pending[relation] = (data) => resolve({ data, meta: { hasNext: false } });
      });
    });
    return pending;
  };

  it('예전 호실 목록이 늦어도 내 호실 목록만 오면 호실과 문서를 보여 준다', async () => {
    deferLists();
    renderPage();
    expect(await screen.findByText('등기부.pdf')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '호실' })).toHaveTextContent('잠실엘스 101동 1203호');
    expect(screen.queryByRole('button', { name: /예전 호실/ })).not.toBeInTheDocument();
  });

  it('주소에 호실이 있으면 호실 목록을 기다리지 않고 문서함을 함께 부른다', async () => {
    deferLists({ deferOwners: true });
    renderPage();
    await waitFor(() => expect(api.getPropertyDocumentBox).toHaveBeenCalledWith('p1'));
    expect(screen.getByText('불러오는 중입니다')).toBeInTheDocument();
  });

  it('예전 호실 주소는 예전 호실 목록이 올 때까지 첫 호실로 바꾸지 않는다', async () => {
    const pending = deferLists();
    api.getPropertyDocumentBox.mockResolvedValue(makeBox({ property: { id: 'p2', displayName: '헬리오시티 305동 804호' } }));
    const { onNavigate } = renderPage({ propertyId: 'p2' });
    await waitFor(() => expect(api.getPropertyDocumentBox).toHaveBeenCalledWith('p2'));
    expect(onNavigate).not.toHaveBeenCalled();
    pending.FORMER_OWNER([former('p2', '헬리오시티 305동 804호')]);
    expect(await screen.findByRole('button', { name: /예전 호실/ })).toHaveAttribute('aria-expanded', 'true');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('예전 호실은 접힌 묶음이고 펼치면 "소유 종료" 줄이 나온다', async () => {
    setupLists({ formers: [former('p2', '헬리오시티 305동 804호')] });
    renderPage();
    const toggle = await screen.findByRole('button', { name: /예전 호실/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('헬리오시티 305동 804호')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText('헬리오시티 305동 804호')).toBeInTheDocument();
    expect(screen.getByText(/소유 종료/)).toBeInTheDocument();
  });

  it('예전 호실 주소로 열면 묶음이 펼쳐지고, 올리기와 삭제(공유한 계약서 포함)가 된다(2026-11-20)', async () => {
    setupLists({ formers: [former('p2', '헬리오시티 305동 804호')] });
    api.getPropertyDocumentBox.mockResolvedValue(
      makeBox({
        property: { id: 'p2', displayName: '헬리오시티 305동 804호' },
        ownerships: [
          {
            id: 'o-p2',
            isActive: false,
            startedAt: '2024-01-01T00:00:00Z',
            endedAt: '2025-01-01T00:00:00Z',
            verificationStatus: 'VERIFIED',
            isUploadable: true,
            documents: [doc('매매계약서', { resourceType: 'OWNERSHIP' })],
          },
        ],
        contracts: [
          contract('옛', {
            ownershipId: 'o-p2',
            status: 'EXPIRED',
            isUploadable: true,
            isOwnershipActive: false,
            documents: [doc('옛계약서', { resourceType: 'CONTRACT', isSharedWithTenant: true })],
          }),
        ],
      }),
    );
    renderPage({ propertyId: 'p2' });
    expect(await screen.findByText('소유가 끝난 호실이에요. 문서는 계속 올리고 지울 수 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /예전 호실/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: '올리기' }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: '매매계약서.pdf 더 보기' }));
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    // 지난 계약은 접혀 있고, 펼치면 임차인에게 공유한 계약서도 지울 수 있다
    expect(screen.queryByText('옛계약서.pdf')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /지난 계약/ }));
    await userEvent.click(screen.getByRole('button', { name: '옛계약서.pdf 더 보기' }));
    expect(screen.getByText('이름 보기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('미인증 호실도 인증 안내 없이 내 소유 문서를 올릴 수 있다(2026-11-20)', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(
      makeBox({ ownerships: [{ ...makeBox().ownerships[0], isUploadable: true, verificationStatus: 'UNVERIFIED', documents: [] }] }),
    );
    setupLists({
      owners: [property('p1', '잠실엘스 101동 1203호', { documentCount: 0, myRelation: { type: 'OWNER', ownershipId: 'o-p1', verificationStatus: 'UNVERIFIED' } })],
    });
    renderPage();
    expect(await screen.findByRole('navigation', { name: '호실' })).toHaveTextContent('문서 없음 · 계약서를 올려 두세요');
    expect(screen.queryByText(/권리자 인증을 마치면/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '인증하기' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '올리기' }).length).toBeGreaterThan(0);
  });

  it('진행 중·끝난 계약의 공유 문서 모두 삭제 메뉴가 있다(2026-11-20)', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(
      makeBox({
        contracts: [
          contract('현재', { documents: [doc('특약', { resourceType: 'CONTRACT', isSharedWithTenant: true })] }),
          contract('지난', { status: 'EXPIRED', documents: [doc('퇴거사진', { resourceType: 'CONTRACT', isSharedWithTenant: true })] }),
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText('특약.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '특약.pdf 더 보기' }));
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /지난 계약/ }));
    await userEvent.click(screen.getByRole('button', { name: '퇴거사진.pdf 더 보기' }));
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(screen.queryByText('임차인에게 공유한 문서라 지울 수 없어요')).not.toBeInTheDocument();
  });

  it('삭제: 확인 팝업 후 deleteDocument를 부르고 문서함을 다시 불러온다. 서버가 거절하면 message를 보여 준다', async () => {
    renderPage();
    await screen.findByText('등기부.pdf');
    await userEvent.click(screen.getByRole('button', { name: '등기부.pdf 더 보기' }));
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = screen.getByRole('dialog', { name: '문서를 삭제할까요?' });
    expect(within(dialog).getByText('삭제하면 되돌릴 수 없어요.')).toHaveClass('text-crit-ink');
    api.deleteDocument.mockRejectedValueOnce(apiError(422, 'DOCUMENT_NOT_DELETABLE', '지울 수 없는 문서입니다.'));
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제하기' }));
    expect(await within(dialog).findByText('지울 수 없는 문서입니다.')).toBeInTheDocument();
    api.deleteDocument.mockResolvedValueOnce(undefined);
    const callsBefore = api.getPropertyDocumentBox.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제하기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.deleteDocument).toHaveBeenCalledWith('등기부');
    await waitFor(() => expect(api.getPropertyDocumentBox.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('줄을 누르면 열고, 화면을 열 때가 아니라 누를 때마다 새 주소를 받는다', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false, location: {}, opener: null, close: vi.fn() });
    renderPage();
    await screen.findByText('등기부.pdf');
    expect(api.postDocumentDownloadUrl).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '등기부.pdf 열기' }));
    await waitFor(() => expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(1));
    // PDF는 팝업 안 미리보기(iframe)로 열리고 새 탭은 열지 않는다.
    expect(await screen.findByTitle('등기부.pdf 미리보기')).toHaveAttribute('src', 'https://files.test/x');
    expect(window.open).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    // 4분 안에 다시 열어도 새 주소를 받는다(열 때마다 감사).
    await userEvent.click(screen.getByRole('button', { name: '등기부.pdf 열기' }));
    await waitFor(() => expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(2));
  });

  it('미리보기 팝업의 [새 탭에서 열기]는 받은 주소를 그대로 쓴다', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage();
    await screen.findByText('등기부.pdf');
    await userEvent.click(screen.getByRole('button', { name: '등기부.pdf 열기' }));
    await screen.findByTitle('등기부.pdf 미리보기');
    await userEvent.click(screen.getByRole('button', { name: '새 탭에서 열기' }));
    expect(window.open).toHaveBeenCalledWith('https://files.test/x', '_blank', 'noopener,noreferrer');
    expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it('미리보기는 PDF와 브라우저가 그리는 사진만, HEIC 등은 새 탭으로 연다', () => {
    expect(isPreviewableDocument({ mimeType: 'image/heic' })).toBe(false);
    expect(isPreviewableDocument({ mimeType: 'image/jpeg' })).toBe(true);
    expect(isPreviewableDocument({ mimeType: 'application/pdf' })).toBe(true);
  });

  it('줄의 다른 칸을 눌러도 열고, 더 보기를 누르면 열지 않는다', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false, location: {}, opener: null, close: vi.fn() });
    renderPage();
    await screen.findByText('등기부.pdf');
    await userEvent.click(screen.getByRole('button', { name: '등기부.pdf 더 보기' }));
    expect(api.postDocumentDownloadUrl).not.toHaveBeenCalled();
    const row = screen.getByRole('button', { name: '등기부.pdf 열기' }).closest('tr');
    await userEvent.click(row.querySelectorAll('td')[2]);
    await waitFor(() => expect(api.postDocumentDownloadUrl).toHaveBeenCalledTimes(1));
  });

  it('주소를 받지 못하면 "파일을 열지 못했어요"를 보여 준다', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false, location: {}, opener: null, close: vi.fn() });
    api.postDocumentDownloadUrl.mockRejectedValue(apiError(503, 'STORAGE_UNAVAILABLE', '저장소 오류'));
    renderPage();
    await screen.findByText('등기부.pdf');
    await userEvent.click(screen.getByRole('button', { name: '등기부.pdf 열기' }));
    // 표 줄과 미리보기 팝업 양쪽에 안내가 나온다.
    expect((await screen.findAllByText('파일을 열지 못했어요')).length).toBeGreaterThan(0);
  });
});
