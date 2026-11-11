// 임차인 앱(#109): 항상 앱 화면(PC 에서는 가운데 모바일 폭). 하단 탭은 홈 · 수리 요청 · 내 정보 세 칸이다.
// 홈은 내 계약 카드(E1), 계약서 화면(E2)은 공유받은 계약서를 보기만 한다. 수리 요청은 티켓 기능 전까지 준비 중.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_PATH, HOME_PATH, TICKETS_PATH } from '../../src/tenant/routes';

const api = vi.hoisted(() => ({
  getContractList: vi.fn(),
  getContract: vi.fn(),
  getDocumentList: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { TenantRoutes } = await import('../../src/tenant/TenantRoutes');

const USER = { id: 't-1', name: '이세입', email: 'tenant@butler.test', role: 'TENANT' };
const CONTRACT = {
  id: 'c-1',
  property: { displayName: '잠실엘스 101동 1203호' },
  landlord: { name: '김임대' },
  status: 'ACTIVE',
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 1200000,
  rentPaymentDay: 25,
  nextRentPaymentDate: '2099-12-25',
  startDate: '2026-12-01',
  endDate: '2028-11-30',
  memo: null,
};

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;
const where = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  api.getContractList.mockResolvedValue({ data: [], meta: {} });
  api.getContract.mockResolvedValue(CONTRACT);
  api.getDocumentList.mockResolvedValue({ data: [], meta: {} });
});

const renderAt = (path, { onLogout = vi.fn() } = {}) => {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tenant/*" element={<TenantRoutes user={USER} onLogout={onLogout} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { ...view, onLogout };
};
const activeTabs = () => screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page').map((button) => button.textContent);

describe('임차인 routes 상수', () => {
  it('접두어와 홈', () => {
    expect(BASE_PATH).toBe('/tenant');
    expect(HOME_PATH).toBe('/tenant/home');
    expect(TICKETS_PATH).toBe('/tenant/tickets');
  });
});

describe('임차인 앱 틀', () => {
  it('앱 셸(data-shell="tenant")에 탭 3칸(홈 · 수리 요청 · 내 정보)이 그려진다', () => {
    const { container } = renderAt('/tenant/home');
    expect(container.querySelector('[data-shell="tenant"]')).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: '하단 메뉴' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['홈', '수리 요청', '내 정보']);
  });

  it.each([
    ['/tenant/home', '홈'],
    ['/tenant/tickets', '수리 요청'],
    ['/tenant/settings', '내 정보'],
  ])('%s 에서는 [%s] 탭이 활성이다', (path, label) => {
    renderAt(path);
    expect(activeTabs()).toEqual([label]);
  });

  it.each(['/tenant/homeless', '/tenant/settingsx', '/tenant/no-such-page'])('%s 는 어느 탭도 활성이 아니다', (path) => {
    renderAt(path);
    expect(activeTabs()).toEqual([]);
  });

  it.each([
    ['홈', '/tenant/home'],
    ['수리 요청', '/tenant/tickets'],
    ['내 정보', '/tenant/settings'],
  ])('[%s] 탭을 누르면 %s 로 이동하고 그 탭이 활성이 된다', async (label, expectedPath) => {
    renderAt(label === '홈' ? '/tenant/settings' : '/tenant/home');
    await userEvent.click(within(screen.getByRole('navigation', { name: '하단 메뉴' })).getByRole('button', { name: label }));
    expect(where()).toBe(expectedPath);
    expect(activeTabs()).toEqual([label]);
  });

  it('/tenant 로 들어오면 /tenant/home 으로 간다', () => {
    renderAt('/tenant');
    expect(where()).toBe('/tenant/home');
    expect(activeTabs()).toEqual(['홈']);
  });
});

describe('임차인 앱: 준비 중 자리 · 내 정보', () => {
  it.each(['/tenant/tickets', '/tenant/settings', '/tenant/no-such-page'])('%s 은 앱 셸 안의 "준비 중"이다', (path) => {
    renderAt(path);
    expect(within(screen.getByRole('main')).getByRole('region', { name: '준비 중' })).toBeInTheDocument();
  });

  it('수리 요청 자리는 [수리 요청] 제목이다', () => {
    renderAt(TICKETS_PATH);
    expect(within(screen.getByRole('region', { name: '준비 중' })).getByRole('heading', { name: '수리 요청' })).toBeInTheDocument();
  });

  it('내 정보 자리에는 계정 정보와 [로그아웃]이 있고, 누르면 onLogout 이 불린다', async () => {
    const { onLogout } = renderAt('/tenant/settings');
    const main = within(screen.getByRole('main'));
    expect(main.getByText('이세입')).toBeInTheDocument();
    expect(main.getByText('tenant@butler.test')).toBeInTheDocument();
    await userEvent.click(main.getByRole('button', { name: '로그아웃' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('상단 바의 아바타(내 계정)를 누르면 내 정보로 간다', async () => {
    renderAt('/tenant/home');
    const avatar = within(screen.getByRole('banner')).getByRole('button', { name: '내 계정' });
    expect(avatar).toHaveTextContent('이');
    await userEvent.click(avatar);
    expect(where()).toBe('/tenant/settings');
  });
});

describe('임차인 홈(E1)', () => {
  it('인사와 계약이 없을 때의 안내, 수리 요청 바로가기', async () => {
    renderAt('/tenant/home');
    expect(screen.getByRole('heading', { name: '이세입 님, 안녕하세요' })).toBeInTheDocument();
    expect(await screen.findByText('아직 연결된 계약이 없어요')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /수리 요청하기/ }));
    expect(where()).toBe('/tenant/tickets');
  });

  it('계약 카드: 기간 · 상태 · 다음 월세 · 임대인, [계약서 보기]로 계약서 화면', async () => {
    api.getContractList.mockResolvedValue({ data: [CONTRACT], meta: {} });
    renderAt('/tenant/home');
    const card = await screen.findByRole('region', { name: '잠실엘스 101동 1203호' });
    expect(within(card).getByText('계약 중')).toBeInTheDocument();
    expect(within(card).getByText('2026.12.01 ~ 2028.11.30')).toBeInTheDocument();
    expect(within(card).getByText(/12월 25일/)).toBeInTheDocument();
    expect(within(card).getByText('김임대')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /계약서 보기/ }));
    expect(where()).toBe('/tenant/contracts/c-1');
  });
});

describe('임차인 계약서(E2)', () => {
  it('금액 · 기간 · 임대인과 공유받은 계약서(PDF 줄 · 사진 격자). 올리기 버튼·하단 탭은 없다', async () => {
    api.getContract.mockResolvedValue(CONTRACT);
    api.getDocumentList.mockResolvedValue({
      data: [
        { id: 'd-1', fileName: '임대차계약서.pdf', mimeType: 'application/pdf', sizeBytes: 1258291 },
        { id: 'd-2', fileName: '1.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 },
      ],
      meta: {},
    });
    api.postDocumentDownloadUrl.mockResolvedValue({ url: 'https://files.example/d', expiresAt: 'x' });
    renderAt('/tenant/contracts/c-1');
    expect(await screen.findByText('5,000만 원')).toBeInTheDocument();
    expect(screen.getByText('120만 원 · 매월 25일')).toBeInTheDocument();
    expect(screen.getByText('김임대')).toBeInTheDocument();
    expect(await screen.findByText('임대차계약서.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 1 크게 보기' })).toBeInTheDocument();
    expect(api.getDocumentList).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'CONTRACT', resourceId: 'c-1' }));
    expect(screen.queryByRole('button', { name: /올리기|업로드/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '하단 메뉴' })).not.toBeInTheDocument();
  });

  it('사진을 누르면 전체 화면 뷰어가 열리고 닫을 수 있다', async () => {
    api.getContract.mockResolvedValue(CONTRACT);
    api.getDocumentList.mockResolvedValue({ data: [{ id: 'd-2', fileName: '1.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 }], meta: {} });
    api.postDocumentDownloadUrl.mockResolvedValue({ url: 'https://files.example/d', expiresAt: 'x' });
    renderAt('/tenant/contracts/c-1');
    await userEvent.click(await screen.findByRole('button', { name: '사진 1 크게 보기' }));
    const dialog = screen.getByRole('dialog', { name: '계약서 크게 보기' });
    expect(within(dialog).getByText('1 / 1')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /돌리기/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /저장/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
