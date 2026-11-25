// 임대인 앱 M11 문서함. 호실 문서함 API를 종류 카드·최근 문서·목록으로 보여 주는지 본다.
// 실패 조건: 종류 수가 documentType 묶음과 다름 · 보험/기타가 카드에 섞임 · 검색이 다른 칸까지 거름
// · 올릴 곳이 없는데 올리기 버튼이 보임 · 401에 onUnauthorized 를 안 부름 · 하단 탭 '내 자산'이 꺼짐.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countByCategory,
  describeDocument,
  filterDocuments,
  flattenDocuments,
  parseCategoryParam,
} from '../../src/landlord/app/utils/documentBoxView';
import { buildLocation } from '../../src/landlord/web/routes';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getPropertyDocumentBox: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
  postUploadSession: vi.fn(),
  putUploadContent: vi.fn(),
  postDocument: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', email: 'landlord@butler.test', role: 'LANDLORD' };
const doc = (id, documentType, overrides = {}) => ({
  id,
  fileName: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1258291,
  documentType,
  uploaderId: 'l-1',
  isLocked: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const BOX = {
  property: { id: 'p1', displayName: '래미안 101동 101호' },
  documentCount: 6,
  ownerships: [
    {
      id: 'o1',
      isActive: true,
      isUploadable: true,
      verificationStatus: 'VERIFIED',
      documents: [doc('registry', 'REGISTRY_CERTIFICATE', { createdAt: '2026-09-28T03:00:00.000Z' }), doc('insurance', 'INSURANCE')],
    },
  ],
  contracts: [
    {
      id: 'c1',
      ownershipId: 'o1',
      tenantName: '김임차',
      startDate: '2024-10-28',
      endDate: '2026-10-27',
      status: 'ACTIVE',
      isUploadable: true,
      documents: [
        doc('lease', 'CONTRACT_DOCUMENT', { fileName: '임대차계약서_101호.pdf', createdAt: '2024-10-28T01:00:00.000Z' }),
        doc('receipt', 'RECEIPT', { fileName: '보일러 수리 영수증.jpg', mimeType: 'image/jpeg', sizeBytes: 430080, createdAt: '2026-10-20T01:00:00.000Z' }),
        doc('move', 'MOVE_PHOTO', { fileName: '입주.jpg', mimeType: 'image/jpeg', createdAt: '2024-10-29T01:00:00.000Z' }),
        doc('report', 'LEASE_REPORT', { createdAt: '2024-11-01T01:00:00.000Z' }),
      ],
    },
  ],
};

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (entry, onUnauthorized = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={onUnauthorized} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onUnauthorized };
};

beforeEach(() => {
  Object.values(api).filter((fn) => typeof fn === 'function').forEach((fn) => fn.mockReset());
  api.getPropertyDocumentBox.mockResolvedValue(BOX);
});

describe('문서함 보기 유틸', () => {
  it('두 묶음을 모아 최근 순으로, 계약 문서에는 계약을 붙인다', () => {
    const documents = flattenDocuments(BOX);
    expect(documents.map((document) => document.id)).toEqual(['receipt', 'insurance', 'registry', 'report', 'move', 'lease']);
    expect(documents.find((document) => document.id === 'lease').contract.id).toBe('c1');
    expect(flattenDocuments(null)).toEqual([]);
  });

  it('종류 카드 수: 계약서는 계약서·신고필증, 사진은 입주 사진, 보험은 어느 칸에도 없다', () => {
    expect(countByCategory(flattenDocuments(BOX))).toEqual({ contract: 2, registry: 1, receipt: 1, photo: 1 });
  });

  it('묶음과 파일 이름 검색으로 거른다', () => {
    const documents = flattenDocuments(BOX);
    expect(filterDocuments(documents, { category: 'contract' }).map((document) => document.id)).toEqual(['report', 'lease']);
    expect(filterDocuments(documents, { category: 'all', query: '  보일러 ' }).map((document) => document.id)).toEqual(['receipt']);
    expect(filterDocuments(documents, { category: 'photo', query: '보일러' })).toEqual([]);
  });

  it('보조 문구와 주소 값', () => {
    expect(describeDocument(BOX.contracts[0].documents[1])).toEqual({ typeLabel: '수리', date: '2026-10-20', size: '420KB' });
    expect(describeDocument(BOX.ownerships[0].documents[1]).typeLabel).toBe('보험');
    expect(parseCategoryParam('photo')).toBe('photo');
    expect(parseCategoryParam('all')).toBe('all');
    expect(parseCategoryParam('nope')).toBeNull();
    expect(buildLocation('documents', { propertyId: 'p1', type: 'all' })).toMatchObject({ pathname: '/landlord/documents', search: '?propertyId=p1&type=all' });
  });
});

describe('M11 문서함', () => {
  it('종류 카드·최근 문서 3건, 하단 탭은 내 자산', async () => {
    renderAt('/landlord/documents?propertyId=p1');
    const kinds = await screen.findByRole('list', { name: '문서 종류' });
    expect(within(kinds).getByRole('button', { name: '계약서 2개' })).toBeInTheDocument();
    expect(within(kinds).getByRole('button', { name: '사진 1개' })).toBeInTheDocument();
    const recent = screen.getByRole('list', { name: '최근 문서 목록' });
    expect(within(recent).getAllByRole('listitem')).toHaveLength(3);
    expect(within(recent).getByText('보일러 수리 영수증.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '내 자산' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText(/GB/)).not.toBeInTheDocument();
  });

  it('종류 카드·[전체]는 주소에 남기고 그 목록을 보여 준다', async () => {
    renderAt('/landlord/documents?propertyId=p1');
    await userEvent.click(await screen.findByRole('button', { name: '계약서 2개' }));
    expect(where()).toBe('/landlord/documents?propertyId=p1&type=contract');
    const list = await screen.findByRole('list', { name: '계약서 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('검색하면 파일 이름으로 찾은 결과만', async () => {
    renderAt('/landlord/documents?propertyId=p1&type=all');
    await screen.findByRole('list', { name: '전체 문서 목록' });
    await userEvent.type(screen.getByRole('searchbox', { name: '문서 이름 검색' }), '계약서');
    const list = screen.getByRole('list', { name: '검색 결과 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.type(screen.getByRole('searchbox', { name: '문서 이름 검색' }), '없음');
    expect(screen.getByText('찾는 문서가 없어요')).toBeInTheDocument();
  });

  it('올릴 곳이 있으면 올리기 시트가 열린다', async () => {
    renderAt('/landlord/documents?propertyId=p1');
    await userEvent.click(await screen.findByRole('button', { name: '문서 올리기' }));
    const sheet = screen.getByRole('dialog', { name: '문서 올리기' });
    expect(within(sheet).getByRole('button', { name: '내 소유 문서' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('올릴 곳이 없으면 올리기 버튼이 없다(끝난 소유 관계)', async () => {
    api.getPropertyDocumentBox.mockResolvedValue({
      ...BOX,
      ownerships: [{ ...BOX.ownerships[0], isActive: false, isUploadable: false }],
      contracts: [{ ...BOX.contracts[0], isUploadable: false }],
    });
    renderAt('/landlord/documents?propertyId=p1');
    await screen.findByRole('list', { name: '문서 종류' });
    expect(screen.queryByRole('button', { name: '문서 올리기' })).not.toBeInTheDocument();
  });

  it('호실이 없으면 내 자산으로 안내한다', async () => {
    renderAt('/landlord/documents');
    await userEvent.click(screen.getByRole('button', { name: '내 자산으로' }));
    expect(where()).toBe('/landlord/buildings');
  });

  it('401이면 onUnauthorized', async () => {
    api.getPropertyDocumentBox.mockRejectedValue(
      Object.assign(new Error('401'), { response: { status: 401, data: { error: { code: 'AUTH_REQUIRED', message: '로그인' } } } }),
    );
    const { onUnauthorized } = renderAt('/landlord/documents?propertyId=p1');
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
