// 앞으로 할 일 카드(#203 P-4b, U-16·H-27·H-38·H-42).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HouseLogTodo } from '../../../../src/landlord/web/components/HouseLogTodo/HouseLogTodo';
import { buildTodoItems } from '../../../../src/landlord/web/utils/houseLogTimeline';

const TODAY = '2026-11-24';
const current = {
  id: 'c1',
  startDate: '2025-03-01',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  tenantName: '김임차',
  renewalNotice: { windowStart: '2026-08-28', deadline: '2026-12-28', safeDeadline: '2026-12-27', phase: 'CLOSING_SOON', hasDeliveredInTime: false, latestNotice: null },
};
const renderTodo = (input) => {
  const onAction = vi.fn();
  render(<HouseLogTodo items={buildTodoItems({ today: TODAY, ...input })} onAction={onAction} />);
  return onAction;
};
const rows = () => within(screen.getByRole('region', { name: '앞으로 할 일' })).getAllByRole('listitem');

describe('앞으로 할 일', () => {
  it('통지 권장 마감 D-n + [통지 기록하기], 만료 + [계약 보기], 퇴거 점검은 누를 곳 없는 "나중에"', async () => {
    const onAction = renderTodo({ current });
    const [noticeRow, endRow, laterRow] = rows();
    expect(noticeRow).toHaveTextContent('갱신 거절 통지 권장 마감 · 2026-12-27');
    expect(noticeRow).toHaveTextContent('D-33');
    expect(endRow).toHaveTextContent('계약 만료 · 2027-02-28');
    expect(endRow).toHaveTextContent('D-96');
    expect(laterRow).toHaveTextContent('나중에');
    expect(within(laterRow).queryByRole('button')).not.toBeInTheDocument();
    await userEvent.click(within(noticeRow).getByRole('button', { name: /통지 기록하기/ }));
    expect(onAction).toHaveBeenCalledWith({ kind: 'NOTICE', label: '통지 기록하기', contractId: 'c1' });
    await userEvent.click(within(endRow).getByRole('button', { name: /계약 보기/ }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'CONTRACT', contractId: 'c1' }));
  });

  it('갱신 확정이면 통지 할 일 없이 갱신 계약·다음 통지 기간', () => {
    renderTodo({ current, next: { id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28' }, nextKind: 'RENEWAL' });
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText(/권장 마감/)).not.toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('갱신 계약 등록됨 · 2027-03-01부터 2년');
    expect(within(rows()[0]).getByRole('button', { name: /갱신 계약 보기/ })).toBeInTheDocument();
  });

  it('새 임차인이면 통지 → 퇴거 점검 → 입주 인수인계 3줄, 뒤 둘은 알림 문구만', () => {
    renderTodo({ current, next: { id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', tenantName: '이새집' }, nextKind: 'NEW_TENANT' });
    const [noticeRow, outRow, inRow] = rows();
    expect(rows()).toHaveLength(3);
    expect(noticeRow).toHaveTextContent('지금 임차인에게 갱신 거절 통지');
    expect(outRow).toHaveTextContent('퇴거 점검 · 2027-02-28 (김임차)');
    expect(inRow).toHaveTextContent('입주 인수인계 · 2027-03-01 (이새집)');
    expect(within(outRow).queryByRole('button')).not.toBeInTheDocument();
    expect(within(inRow).queryByRole('button')).not.toBeInTheDocument();
  });

  it('통지 없이 마감이 지나면 묵시적 갱신 안내 + [갱신 계약 등록]', async () => {
    const onAction = renderTodo({ current: { ...current, renewalNotice: { ...current.renewalNotice, phase: 'CLOSED' } }, today: '2027-01-05' });
    expect(rows()[0]).toHaveTextContent('같은 조건 2년 갱신으로 봐요 · 갱신 계약을 등록해 기간을 맞추세요');
    await userEvent.click(within(rows()[0]).getByRole('button', { name: /갱신 계약 등록/ }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'RENEW', contractId: 'c1' }));
  });

  it('할 일이 없으면 카드를 그리지 않는다', () => {
    renderTodo({ current: null });
    expect(screen.queryByRole('region', { name: '앞으로 할 일' })).not.toBeInTheDocument();
  });
});
