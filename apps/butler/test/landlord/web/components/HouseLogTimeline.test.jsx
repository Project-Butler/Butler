// 한 호실 계약 타임라인·작은 카드(#203 P-4b, H-25~H-27·H-30·H-34·H-39).
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HouseLogTimeline } from '../../../../src/landlord/web/components/HouseLogTimeline/HouseLogTimeline';
import { classifyContracts, computeAxis, groupDotsByDate, toContractDots, toRecordDots } from '../../../../src/landlord/web/utils/houseLogTimeline';

const TODAY = '2026-11-24';
const notice = { windowStart: '2026-08-28', deadline: '2026-12-28', safeDeadline: '2026-12-27', phase: 'CLOSING_SOON', daysUntilDeadline: 34, hasDeliveredInTime: false, latestNotice: null };
const contract = (overrides) => ({
  id: 'c1',
  startDate: '2025-03-01',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  terminatedOn: null,
  previousContractId: null,
  tenantName: '김임차',
  createdAt: null,
  renewalNotice: notice,
  ...overrides,
});
const log = (overrides) => ({
  id: 'l1',
  type: 'REPAIR',
  scope: 'PROPERTY_HISTORY',
  room: 'KITCHEN',
  title: '주방 수전 교체',
  content: '카트리지 교체\n둘째 줄',
  cost: 180000,
  occurredOn: '2026-11-21',
  isFromPreviousOwner: false,
  ...overrides,
});

// 화면과 같은 계산으로 props를 만든다.
const renderTimeline = ({ contracts = [contract()], logs = [log()], band = null, ownershipEndedOn = null, notices = [], filter = {} } = {}) => {
  const split = classifyContracts(contracts, { ownershipEndedOn });
  const axis = computeAxis({ ...split, band, today: TODAY, ownershipEndedOn });
  const groups = groupDotsByDate([...toRecordDots(logs, axis, filter), ...toContractDots({ ...split, notices }, axis)]);
  const handlers = { onShowLog: vi.fn(), onShowContract: vi.fn(), onRegisterContract: vi.fn() };
  render(
    <>
      <HouseLogTimeline
        axis={axis}
        groups={groups}
        {...split}
        band={band}
        today={TODAY}
        endedOn={ownershipEndedOn}
        isSold={Boolean(ownershipEndedOn)}
        hiddenPastCount={axis.hiddenPastCount}
        propertyName="하늘숲 1203호"
        {...handlers}
      />
      <button type="button">바깥</button>
    </>,
  );
  return handlers;
};

describe('타임라인 그리기', () => {
  it('지금 계약 막대·오늘·통지 기간·마감·점, 머리에 기간·지난 비율·칩', () => {
    renderTimeline();
    const card = screen.getByRole('region', { name: '계약 타임라인' });
    expect(card).toHaveTextContent('2025-03-01 ~ 2027-02-28 · 2년 중 87% 지남 · 임차인 김임차');
    expect(within(card).getByText('갱신 거절 통지 기간')).toBeInTheDocument();
    expect(within(card).getByText('만료 D-96')).toBeInTheDocument();
    expect(screen.getByTestId('current-contract-bar')).toBeInTheDocument();
    expect(screen.getByTestId('today-line')).toHaveTextContent('오늘 11-24');
    expect(screen.getByTestId('notice-window')).toBeInTheDocument();
    expect(screen.getByTestId('notice-deadline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-11-21 수리 주방 수전 교체' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2025-03-01 계약·통지 계약 시작' })).toBeInTheDocument();
  });

  it('지난 계약은 회색 막대(H-34)', () => {
    renderTimeline({ contracts: [contract({ id: 'p1', startDate: '2023-03-01', endDate: '2025-02-28', status: 'EXPIRED', tenantName: '정이전' }), contract()] });
    expect(screen.getAllByTestId('past-contract-bar')).toHaveLength(1);
    expect(screen.getByRole('region', { name: '계약 타임라인' })).toHaveTextContent('지난 계약 1건');
    expect(screen.getByRole('button', { name: '2023-03-01 계약·통지 지난 계약 시작' })).toBeInTheDocument();
    expect(screen.getByText('지난 계약(버틀러에 등록된 것만)')).toBeInTheDocument();
  });

  it('계약이 없으면 회색 빈 상태 + [계약 등록](H-39), 기록 점은 그대로', async () => {
    const { onRegisterContract } = renderTimeline({ contracts: [] });
    expect(screen.getByTestId('empty-track')).toBeInTheDocument();
    expect(screen.getByText('진행 중인 계약이 없어요')).toBeInTheDocument();
    expect(screen.getByText('계약 없음')).toBeInTheDocument();
    expect(screen.queryByTestId('notice-window')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-11-21 수리 주방 수전 교체' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /계약 등록/ }));
    expect(onRegisterContract).toHaveBeenCalled();
  });

  it('갱신 계약: 초록 점선 막대, 통지 흐림, "갱신 확정"', () => {
    renderTimeline({ contracts: [contract(), contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', previousContractId: 'c1' })] });
    expect(screen.getByTestId('renewal-contract-bar')).toBeInTheDocument();
    expect(screen.getByTestId('notice-window').className).toContain('opacity-30');
    expect(screen.getByTestId('notice-deadline').className).toContain('opacity-30');
    expect(screen.getByText('갱신 확정')).toBeInTheDocument();
    expect(screen.queryByText('통지 기간 시작')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2027-03-01 계약·통지 갱신 계약 시작 · 2029-02-28까지' })).toBeInTheDocument();
  });

  it('새 임차인 계약: 파랑 점선 막대 + 경계선, 통지는 그대로', () => {
    renderTimeline({ contracts: [contract(), contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', tenantName: '이새집' })] });
    expect(screen.getByTestId('new-tenant-contract-bar')).toBeInTheDocument();
    expect(screen.getByTestId('contract-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('notice-window').className).not.toContain('opacity-30');
    expect(screen.getByText('다음 임차인 입주 예정')).toBeInTheDocument();
  });

  it('이전 소유 띠(H-30): 회색 띠·집 이력 n건·내 소유 시작, 그 전 기록 수', () => {
    const band = { start: '2024-09-01', end: '2026-09-01', count: 3, olderCount: 1 };
    renderTimeline({
      contracts: [contract({ startDate: '2026-10-01', endDate: '2028-09-30', renewalNotice: { ...notice, windowStart: '2028-03-30', deadline: '2028-07-30', phase: 'BEFORE_WINDOW' } })],
      logs: [log({ id: 'prev', occurredOn: '2025-03-18', isFromPreviousOwner: true })],
      band,
    });
    expect(screen.getByTestId('owner-band')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: '계약 타임라인' });
    expect(card).toHaveTextContent('이전 소유 기간집 이력 3건');
    expect(card).toHaveTextContent('내 소유 시작2026-09-01');
    expect(card).toHaveTextContent('그 전 기록 1건');
    expect(card).toHaveTextContent('2026-09-01 소유 시작 · 지금 계약 2026-10-01 ~ 2028-09-30');
  });

  it('소유가 끝난 호실: 읽기 전용 머리, 빈 상태·통지 없음', () => {
    renderTimeline({ ownershipEndedOn: '2026-10-31' });
    const card = screen.getByRole('region', { name: '계약 타임라인' });
    expect(card).toHaveTextContent('2026-10-31 매도 · 읽기 전용 · 지난 계약 1건');
    expect(screen.queryByText('진행 중인 계약이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notice-window')).not.toBeInTheDocument();
  });
});

describe('작은 카드(H-26)', () => {
  const dotName = '2026-11-21 수리 주방 수전 교체';

  it('점을 누르면 열리고 날짜·유형·방·비용·내용 첫 줄, [상세 보기]는 그 기록', async () => {
    const { onShowLog } = renderTimeline({ logs: [log({ scope: 'PRIVATE' })] });
    const dot = screen.getByRole('button', { name: dotName });
    await userEvent.click(dot);
    expect(dot).toHaveAttribute('aria-expanded', 'true');
    const card = screen.getByRole('dialog', { name: '2026-11-21 주방 수전 교체' });
    expect(card).toHaveTextContent('2026-11-21');
    expect(card).toHaveTextContent('수리');
    expect(card).toHaveTextContent('주방');
    expect(card).toHaveTextContent('180,000원');
    expect(card).toHaveTextContent('카트리지 교체');
    expect(card).not.toHaveTextContent('둘째 줄');
    expect(within(card).getByText('나만 보기')).toBeInTheDocument();
    expect(card).toHaveFocus();
    await userEvent.click(within(card).getByRole('button', { name: /상세 보기/ }));
    expect(onShowLog).toHaveBeenCalledWith('l1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc로 닫으면 포커스가 점으로 돌아간다', async () => {
    renderTimeline();
    const dot = screen.getByRole('button', { name: dotName });
    await userEvent.click(dot);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dot).toHaveFocus();
  });

  it('닫기 버튼으로 닫으면 포커스가 점으로', async () => {
    renderTimeline();
    const dot = screen.getByRole('button', { name: dotName });
    await userEvent.click(dot);
    await userEvent.click(screen.getByRole('button', { name: '작은 카드 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dot).toHaveFocus();
  });

  it('다시 누르면 닫힌다', async () => {
    renderTimeline();
    const dot = screen.getByRole('button', { name: dotName });
    await userEvent.click(dot);
    await userEvent.click(dot);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dot).toHaveAttribute('aria-expanded', 'false');
  });

  it('바깥을 누르면 닫힌다', async () => {
    renderTimeline();
    await userEvent.click(screen.getByRole('button', { name: dotName }));
    fireEvent.mouseDown(screen.getByRole('button', { name: '바깥' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('점은 Tab으로 차례로 닿는 버튼이고 Enter로 연다', async () => {
    renderTimeline({ logs: [log(), log({ id: 'l2', occurredOn: '2026-06-02', type: 'NOTE', title: '도배 메모' })] });
    const dots = screen.getAllByRole('button', { name: /^20\d\d-/ });
    expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual(['2025-03-01 계약·통지 계약 시작', '2026-06-02 메모 도배 메모', dotName]);
    dots[0].focus();
    await userEvent.tab();
    expect(dots[1]).toHaveFocus();
    await userEvent.tab();
    expect(dots[2]).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('같은 날 점은 하나로 묶고 카드에 목록, 계약은 [계약 보기]', async () => {
    const { onShowContract, onShowLog } = renderTimeline({ logs: [log({ id: 'same', occurredOn: '2025-03-01', type: 'NOTE', title: '입주 메모', scope: 'PRIVATE' })] });
    const dot = screen.getByRole('button', { name: '2025-03-01 기록 2건' });
    expect(dot).toHaveTextContent('2');
    await userEvent.click(dot);
    const card = screen.getByRole('dialog', { name: '2025-03-01 기록 2건' });
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('입주 메모');
    expect(within(items[0]).getByText('나만 보기')).toBeInTheDocument();
    await userEvent.click(within(items[1]).getByRole('button', { name: /계약 보기/ }));
    expect(onShowContract).toHaveBeenCalledWith('c1');
    await userEvent.click(within(items[0]).getByRole('button', { name: /상세 보기/ }));
    expect(onShowLog).toHaveBeenCalledWith('same');
  });

  it('넘겨받은 기록은 "이전 소유자 기록 · 읽기 전용"', async () => {
    renderTimeline({ logs: [log({ isFromPreviousOwner: true })] });
    await userEvent.click(screen.getByRole('button', { name: dotName }));
    expect(within(screen.getByRole('dialog')).getByText('이전 소유자 기록 · 읽기 전용')).toBeInTheDocument();
  });
});
