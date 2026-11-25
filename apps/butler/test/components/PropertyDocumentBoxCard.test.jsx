import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyDocumentBoxCard } from '../../src/landlord/web/components/PropertyDocumentBoxCard/PropertyDocumentBoxCard';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getPropertyDocumentBox: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
}));

vi.mock('@butler/api-client', () => api);

const doc = (id, createdAt) => ({ id, fileName: `${id}.pdf`, createdAt });
const ownership = (patch = {}) => ({ id: 'o-1', isActive: true, verificationStatus: 'VERIFIED', isUploadable: true, documents: [], ...patch });
const contract = (patch = {}) => ({
  id: 'c-1',
  ownershipId: 'o-1',
  tenantName: '이세입',
  startDate: '2025-03-02',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  isUploadable: true,
  documents: [],
  ...patch,
});
const box = (patch = {}) => ({ property: { id: 'p-1', displayName: '잠실엘스 101동 1203호' }, documentCount: 0, ownerships: [ownership()], contracts: [], ...patch });

const renderCard = () => {
  const onNavigate = vi.fn();
  render(<PropertyDocumentBoxCard propertyId="p-1" onNavigate={onNavigate} />);
  return { onNavigate };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PropertyDocumentBoxCard (호실 상세 문서함 카드)', () => {
  it('제목에 건수, 두 칸에 개수와 최근 파일 2개 + 외 n건, [문서함 열기]로 이동한다', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(
      box({
        documentCount: 5,
        ownerships: [ownership({ documents: [doc('등기부', '2026-10-14T00:00:00Z'), doc('매매계약서', '2026-10-13T00:00:00Z')] })],
        contracts: [
          contract({ documents: [doc('계약서', '2026-10-12T00:00:00Z'), doc('신고필증', '2026-10-11T00:00:00Z'), doc('입주사진', '2026-10-10T00:00:00Z')] }),
        ],
      }),
    );
    const { onNavigate } = renderCard();
    expect(await screen.findByText('5건')).toBeInTheDocument();
    expect(screen.getByText('등기부.pdf')).toBeInTheDocument();
    expect(screen.getByText('매매계약서.pdf')).toBeInTheDocument();
    expect(screen.getByText('계약서.pdf')).toBeInTheDocument();
    expect(screen.queryByText('입주사진.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('진행 중 계약 있음', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/외/)).toHaveTextContent('외 1건');
    await userEvent.click(screen.getByRole('button', { name: '문서함 열기' }));
    expect(onNavigate).toHaveBeenCalledWith('documents', { propertyId: 'p-1' });
  });

  it('인증된 활성 소유 관계는 [문서 업로드]가 보인다', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(box());
    renderCard();
    expect(await screen.findByRole('button', { name: '문서 업로드' })).toBeInTheDocument();
  });

  it('미인증이어도 [문서 업로드]가 보이고 인증 안내는 없다(2026-11-20)', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(box({ ownerships: [ownership({ isUploadable: true, verificationStatus: 'UNVERIFIED' })] }));
    renderCard();
    expect(await screen.findByRole('button', { name: '문서 업로드' })).toBeInTheDocument();
    expect(screen.queryByText(/권리자 인증을 마치면/)).not.toBeInTheDocument();
  });

  it('끝난 소유 호실도 [문서 업로드]가 보이고 인증 안내는 없다(2026-11-20)', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(
      box({ ownerships: [ownership({ isActive: false, isUploadable: true })], contracts: [contract({ isUploadable: true, isOwnershipActive: false, status: 'EXPIRED' })] }),
    );
    renderCard();
    expect(await screen.findByRole('button', { name: '문서함 열기' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '문서 업로드' })).toBeInTheDocument();
    expect(screen.queryByText(/권리자 인증을 마치면/)).not.toBeInTheDocument();
  });

  it('인증이 만료돼도 올릴 수 있는 계약이 있으면 [문서 업로드]가 보인다', async () => {
    api.getPropertyDocumentBox.mockResolvedValue(
      box({ ownerships: [ownership({ isUploadable: false, verificationStatus: 'EXPIRED' })], contracts: [contract()] }),
    );
    renderCard();
    expect(await screen.findByRole('button', { name: '문서 업로드' })).toBeInTheDocument();
  });

  it('불러오지 못하면 서버 message를 보여 준다', async () => {
    api.getPropertyDocumentBox.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 404, data: { error: { code: 'PROPERTY_NOT_FOUND', message: '호실을 찾을 수 없어요.' } } } }));
    renderCard();
    expect(await screen.findByText('호실을 찾을 수 없어요.')).toBeInTheDocument();
  });
});
