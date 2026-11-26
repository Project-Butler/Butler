// 임대인 앱 일정·알림(#163). 실패 조건: 일정 기간·주 띠 점이 API 와 다름 · 토글이 엉뚱한 type 을 끔 ·
// 수리 요청·이메일 토글이 생김 · 알림을 눌러도 읽음 처리·이동이 안 됨 · 안 읽은 수가 맞지 않음.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getScheduleList: vi.fn(),
  getNotificationPreference: vi.fn(),
  patchNotificationPreference: vi.fn(),
  getNotificationList: vi.fn(),
  // 위 막대 말풍선(안 읽은 대화 수, docs/19 A0)
  getThreadList: vi.fn(async () => ({ data: [], meta: { page: 1, size: 100, total: 0, hasNext: false } })),
  getNotificationUnreadCount: vi.fn(),
  postNotificationRead: vi.fn(),
  postNotificationReadAll: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '최앱주', role: 'LANDLORD' };
const PROPERTY = { id: 'p1', displayName: '래미안 101동 1203호' };

const schedule = (overrides) => ({
  id: `s-${overrides.kind}-${overrides.date}`,
  source: 'SYSTEM',
  title: '월세 입금일',
  memo: null,
  time: null,
  remindOn: null,
  amount: null,
  property: PROPERTY,
  related: { resourceType: 'CONTRACT', resourceId: 'c1' },
  ...overrides,
});

const RENT = schedule({ kind: 'RENT_PAYMENT', date: '2026-11-25', amount: 500000 });
const DEADLINE = schedule({ kind: 'RENEWAL_NOTICE_DEADLINE', date: '2026-12-31', title: '갱신 거절 통지 마감' });

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T03:00:00Z')); // KST 2026-11-19(목)
  api.getScheduleList.mockImplementation(async ({ fromDate, toDate }) => [RENT, DEADLINE].filter((item) => item.date >= fromDate && item.date <= toDate));
  api.getNotificationPreference.mockResolvedValue({ webPushEnabled: true, mutedTypes: ['RENT_PAYMENT_DUE'] });
  api.patchNotificationPreference.mockImplementation(async (body) => ({ webPushEnabled: true, ...body }));
  api.getNotificationUnreadCount.mockResolvedValue({ count: 2 });
  api.getNotificationList.mockResolvedValue({
    data: [
      { id: 'n1', type: 'RENEWAL_NOTICE_DEADLINE_SOON', title: '갱신 거절 통지 마감 7일 전', body: '래미안 101동 1203호', link: '/contracts/c1', readAt: null, createdAt: '2026-11-19T02:30:00Z' },
      { id: 'n2', type: 'RENT_PAYMENT_DUE', title: '오늘 월세 입금일', body: null, link: null, readAt: null, createdAt: '2026-11-18T23:00:00Z' },
      { id: 'n3', type: 'CONTRACT_EXPIRING_SOON', title: '계약 만기 30일 전', body: null, link: null, readAt: '2026-11-10T00:00:00Z', createdAt: '2026-11-10T00:00:00Z' },
    ],
    meta: { nextCursor: null, hasNext: false },
  });
  api.postNotificationRead.mockResolvedValue();
  api.postNotificationReadAll.mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe('일정 탭', () => {
  it('예정 일정은 오늘부터 60일, 주 띠는 이번 주(일~토)를 부른다', async () => {
    renderAt('/landlord/schedules');
    await screen.findAllByText('래미안 101동 1203호');

    expect(api.getScheduleList).toHaveBeenCalledWith({ fromDate: '2026-11-19', toDate: '2027-01-17' });
    expect(api.getScheduleList).toHaveBeenCalledWith({ fromDate: '2026-11-15', toDate: '2026-11-21' });
  });

  it('일정 한 줄: 제목, 호실(자르지 않음), 날짜 · 금액, D-day. 누르면 그 계약으로', async () => {
    renderAt('/landlord/schedules');
    const list = within(await screen.findByRole('region', { name: '예정 일정' }));
    const rent = await list.findByRole('button', { name: /월세 입금일/ });
    expect(rent).toHaveTextContent('래미안 101동 1203호');
    expect(rent).toHaveTextContent('11월 25일 (수)');
    expect(rent).toHaveTextContent('50만');
    expect(rent).toHaveTextContent('D-6');
    expect(list.getByRole('button', { name: /갱신 거절 통지 마감/ })).toHaveTextContent('D-42');

    await userEvent.click(rent);
    expect(where()).toBe('/landlord/contracts/c1');
  });

  it('다음 주로 넘기면 일정 있는 날에 점이 붙고, 그날을 누르면 그날 일정만', async () => {
    renderAt('/landlord/schedules');
    await screen.findAllByText('래미안 101동 1203호');
    expect(screen.getByRole('heading', { name: '2026년 11월' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다음 주' }));
    expect(api.getScheduleList).toHaveBeenCalledWith({ fromDate: '2026-11-22', toDate: '2026-11-28' });
    const day = await screen.findByRole('button', { name: '11월 25일 (수), 일정 1개' });

    await userEvent.click(day);
    const list = within(screen.getByRole('region', { name: '11월 25일 (수) 일정' }));
    expect(list.getByRole('button', { name: /월세 입금일/ })).toBeInTheDocument();
    expect(list.queryByRole('button', { name: /갱신 거절 통지 마감/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '전체 보기' }));
    expect(screen.getByRole('region', { name: '예정 일정' })).toBeInTheDocument();
  });

  it('알림 받기: 계약 만기·갱신 거절 통지 기한·월세 입금일 셋뿐이고, 꺼진 type 은 꺼져 보인다', async () => {
    renderAt('/landlord/schedules');
    const card = within(await screen.findByRole('region', { name: '알림 받기' }));
    const switches = await card.findAllByRole('switch');
    expect(switches.map((item) => item.getAttribute('aria-label'))).toEqual(['계약 만기 알림', '갱신 거절 통지 기한 알림', '월세 입금일 알림']);
    expect(card.getByRole('switch', { name: '월세 입금일 알림' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/수리 요청|이메일/)).toBeNull();
  });

  it('토글을 끄면 그 type 을 모두 mutedTypes 에 더해 저장한다', async () => {
    renderAt('/landlord/schedules');
    const toggle = await screen.findByRole('switch', { name: '갱신 거절 통지 기한 알림' });
    await userEvent.click(toggle);

    expect(api.patchNotificationPreference).toHaveBeenCalledWith({
      mutedTypes: ['RENT_PAYMENT_DUE', 'RENEWAL_NOTICE_WINDOW_OPEN', 'RENEWAL_NOTICE_DEADLINE_SOON'],
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('저장에 실패하면 되돌리고 오류를 보여 준다', async () => {
    api.patchNotificationPreference.mockRejectedValue({ response: { status: 500, data: { error: { message: '저장하지 못했어요.' } } } });
    renderAt('/landlord/schedules');
    const toggle = await screen.findByRole('switch', { name: '계약 만기 알림' });
    await userEvent.click(toggle);

    expect(await screen.findByText('저장하지 못했어요.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

describe('알림 탭', () => {
  it('탭 이름에 안 읽은 수, 탭을 바꾸면 주소에 남는다', async () => {
    renderAt('/landlord/schedules');
    await userEvent.click(await screen.findByRole('tab', { name: '알림 2' }));
    expect(where()).toBe('/landlord/schedules?tab=notifications');
    expect(await screen.findByText('갱신 거절 통지 마감 7일 전')).toBeInTheDocument();
  });

  it('알림을 누르면 읽음 처리하고 link 의 화면으로 간다', async () => {
    renderAt('/landlord/schedules?tab=notifications');
    await userEvent.click(await screen.findByRole('button', { name: /갱신 거절 통지 마감 7일 전/ }));

    expect(api.postNotificationRead).toHaveBeenCalledWith('n1');
    expect(where()).toBe('/landlord/contracts/c1');
  });

  it('link 가 없으면 읽음 처리만 하고 남는다. 안 읽은 수가 줄어든다', async () => {
    renderAt('/landlord/schedules?tab=notifications');
    await userEvent.click(await screen.findByRole('button', { name: /오늘 월세 입금일/ }));

    expect(api.postNotificationRead).toHaveBeenCalledWith('n2');
    expect(where()).toBe('/landlord/schedules?tab=notifications');
    expect(screen.getByRole('tab', { name: '알림 1' })).toBeInTheDocument();
  });

  it('[모두 읽음]은 한 번에 읽음 처리하고 탭 숫자를 없앤다', async () => {
    renderAt('/landlord/schedules?tab=notifications');
    await screen.findByText('갱신 거절 통지 마감 7일 전');
    await userEvent.click(screen.getByRole('button', { name: '모두 읽음' }));

    expect(api.postNotificationReadAll).toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: '알림' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
  });
});
