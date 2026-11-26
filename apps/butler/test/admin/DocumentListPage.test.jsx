// 관리자 문서 목록(docs/18 계획 v3). 메타데이터만 보여 주고 파일을 여는 버튼·링크는 없다. 조건·쪽 번호는 URL 쿼리에 둔다.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getAdminDocumentList: vi.fn(),
}));

import { getAdminDocumentList } from '@butler/api-client';
import { DocumentListPage } from '../../src/admin/pages/DocumentListPage';

const UUID = '00000000-0000-4000-8000-000000000001';
const doc = (overrides = {}) => ({
  id: 'd1',
  documentType: 'CONTRACT_DOCUMENT',
  fileName: '임대차계약서.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2457600,
  resourceType: 'CONTRACT',
  resourceId: 'c1',
  property: { id: 'p1', displayName: '버틀러 단지 101동 1001호' },
  link: { type: 'CONTRACT', id: 'c1' },
  uploader: { id: 'u1', name: '김임대', role: 'LANDLORD' },
  createdAt: '2026-11-25T05:02:00Z',
  ...overrides,
});
const page = (items, total = items.length) => ({ data: items, meta: { page: 1, size: 20, total, hasNext: false } });

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderList = (url = '/documents') => {
  const handlers = { onNavigate: vi.fn(), onUnauthorized: vi.fn() };
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/documents" element={<><DocumentListPage {...handlers} /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return handlers;
};
const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('관리자 문서 목록', () => {
  it('URL 쿼리 조건으로 부르고, 표에 등록일·파일 이름·종류·크기·첨부 위치·호실·등록자를 보여 준다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([doc()]));
    renderList(`/documents?resourceType=CONTRACT,TICKET&from=2026-11-01&until=2026-11-26&uploaderId=${UUID}&page=2`);

    const row = (await screen.findByText('임대차계약서.pdf')).closest('tr');
    expect(getAdminDocumentList).toHaveBeenCalledWith({
      resourceType: 'CONTRACT,TICKET', uploaderId: UUID, from: '2026-11-01', until: '2026-11-26', page: 2, size: 20,
    });
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual([
      '2026-11-25 14:02', '임대차계약서.pdf', '계약서·특약', '2.3MB', '계약', '버틀러 단지 101동 1001호', '임대인 · 김임대',
    ]);
    expect(screen.getByText('파일 내용은 이 화면에서 열 수 없어요.', { exact: false })).toBeInTheDocument();
  });

  it('첨부 위치 칩을 누르면 쉼표로 묶어 URL에 남기고 1쪽으로 돌아간다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([]));
    renderList('/documents?page=3');
    await screen.findByText('조건에 맞는 문서가 없습니다.');

    await userEvent.click(screen.getByRole('button', { name: '갱신 통지' }));
    expect(location()).toBe('/documents?resourceType=RENEWAL_NOTICE');
    await userEvent.click(screen.getByRole('button', { name: '계약' }));
    expect(location()).toBe('/documents?resourceType=CONTRACT%2CRENEWAL_NOTICE');
    await userEvent.click(screen.getByRole('button', { name: '갱신 통지' }));
    expect(location()).toBe('/documents?resourceType=CONTRACT');
  });

  it('칩 이름은 소유 서류(관리자 화면에서는 "내"를 붙이지 않는다)를 포함한 여섯 개다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([]));
    renderList();
    const group = await screen.findByRole('group', { name: '첨부 위치' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '계약', '소유 서류', '수리 요청', '하우스 로그', '메시지', '갱신 통지',
    ]);
  });

  it('등록자는 회원 ID(UUID)만 받는다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([]));
    renderList();
    const input = await screen.findByPlaceholderText('등록자 (회원 ID)');

    await userEvent.type(input, 'abc');
    await userEvent.click(screen.getByRole('button', { name: '찾기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('회원 ID(UUID) 형식이 아닙니다.');
    expect(location()).toBe('/documents');

    await userEvent.clear(input);
    await userEvent.type(input, UUID);
    await userEvent.click(screen.getByRole('button', { name: '찾기' }));
    expect(location()).toBe(`/documents?uploaderId=${UUID}`);
  });

  it('이동 대상이 있으면 계약·수리 요청 상세로 가고, 없으면 글자만 보인다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(
      page([
        doc({ id: 'd1', resourceType: 'RENEWAL_NOTICE', link: { type: 'CONTRACT', id: 'c9' } }),
        doc({ id: 'd2', resourceType: 'TICKET', link: { type: 'TICKET', id: 't9' }, fileName: 'IMG_1.jpg', mimeType: 'image/jpeg' }),
        doc({ id: 'd3', resourceType: 'THREAD_MESSAGE', link: null, fileName: '영수증.png', mimeType: 'image/png' }),
      ]),
    );
    const { onNavigate } = renderList();

    const noticeRow = (await screen.findAllByText('임대차계약서.pdf'))[0].closest('tr');
    await userEvent.click(within(noticeRow).getByRole('button', { name: '갱신 통지' }));
    expect(onNavigate).toHaveBeenCalledWith('contractDetail', { contractId: 'c9' });

    const ticketRow = screen.getByText('IMG_1.jpg').closest('tr');
    await userEvent.click(within(ticketRow).getByRole('button', { name: '수리 요청' }));
    expect(onNavigate).toHaveBeenCalledWith('ticketDetail', { ticketId: 't9' });

    const messageRow = screen.getByText('영수증.png').closest('tr');
    expect(within(messageRow).queryByRole('button')).toBeNull();
    expect(within(messageRow).getByText('메시지')).toBeInTheDocument();
  });

  it('시작일을 끝일보다 늦게 고르면 끝일을 같은 날로 맞춘다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([]));
    renderList('/documents?from=2026-11-01&until=2026-11-10');
    const start = await screen.findByLabelText('등록일 시작');
    await userEvent.clear(start);
    await userEvent.type(start, '2026-11-20');
    const params = new URLSearchParams(location().split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({ from: '2026-11-20', until: '2026-11-20' });
  });

  it('[찾기]를 누르지 않은 등록자 입력은 다른 조건을 바꾸면 적용된 값으로 돌아간다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([]));
    renderList();
    const input = await screen.findByPlaceholderText('등록자 (회원 ID)');
    await userEvent.type(input, UUID);
    await userEvent.click(screen.getByRole('button', { name: '메시지' }));
    expect(location()).toBe('/documents?resourceType=THREAD_MESSAGE');
    expect(input).toHaveValue('');
  });

  it('파일을 여는 버튼·다운로드 링크가 없다', async () => {
    vi.mocked(getAdminDocumentList).mockResolvedValue(page([doc({ link: null, resourceType: 'OWNERSHIP' })]));
    renderList();
    const row = (await screen.findByText('임대차계약서.pdf')).closest('tr');
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /열기|다운로드|미리보기/ })).toBeNull();
  });
});
