import { describe, expect, it } from 'vitest';
import { toTenantPath } from '../../src/tenant/routes';
import {
  buildTicketChanges,
  canChangeTicket,
  formatTicketShortDateTime,
  getTenantTicketBadge,
  getTicketStepIndex,
  toRequestableHomes,
} from '../../src/tenant/utils/tickets';

describe('임차인 수리 요청 표시 계산', () => {
  it('상태 칩: 임차인 문구, 처리 중은 점선(pending)', () => {
    expect(getTenantTicketBadge('OPEN')).toEqual({ label: '접수됨', tone: 'warning' });
    expect(getTenantTicketBadge('IN_PROGRESS')).toEqual({ label: '처리 중', tone: 'pending' });
    expect(getTenantTicketBadge('DONE')).toEqual({ label: '완료', tone: 'success' });
    expect(getTenantTicketBadge('CANCELED')).toEqual({ label: '취소', tone: 'default' });
  });

  it('진행 단계 번호: 접수 0 · 처리 중 1 · 완료 2 · 취소 -1', () => {
    expect(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'].map(getTicketStepIndex)).toEqual([0, 1, 2, -1]);
  });

  it('고칠 수 있는 건 접수 상태이고 읽기 전용이 아닐 때만(처리 중 취소는 화면이 막는다)', () => {
    expect(canChangeTicket({ status: 'OPEN', isReadOnly: false })).toBe(true);
    expect(canChangeTicket({ status: 'OPEN', isReadOnly: true })).toBe(false);
    expect(canChangeTicket({ status: 'IN_PROGRESS', isReadOnly: false })).toBe(false);
    expect(canChangeTicket(null)).toBe(false);
  });

  it('요청할 수 있는 집: 시작 전·진행 중·만료 임박 계약의 호실, 같은 호실은 한 번', () => {
    const contracts = [
      { status: 'ACTIVE', property: { id: 'p-1', displayName: 'A동 101호' } },
      { status: 'UPCOMING', property: { id: 'p-1', displayName: 'A동 101호' } },
      { status: 'EXPIRING_SOON', property: { id: 'p-2', displayName: 'B동 202호' } },
      { status: 'EXPIRED', property: { id: 'p-3', displayName: 'C동 303호' } },
      { status: 'TERMINATED', property: { id: 'p-4', displayName: 'D동 404호' } },
    ];
    expect(toRequestableHomes(contracts)).toEqual([
      { propertyId: 'p-1', displayName: 'A동 101호' },
      { propertyId: 'p-2', displayName: 'B동 202호' },
    ]);
    expect(toRequestableHomes([])).toEqual([]);
  });

  it('목록 시각은 한국 시간 MM-DD HH:mm', () => {
    expect(formatTicketShortDateTime('2026-11-24T01:12:00Z')).toBe('11-24 10:12');
    expect(formatTicketShortDateTime(null)).toBeNull();
  });

  it('고치기는 바뀐 칸만 보낸다(방을 빼면 null)', () => {
    const ticket = { title: '누수', description: '물이 새요', room: 'KITCHEN' };
    expect(buildTicketChanges(ticket, { title: '누수', description: '물이 새요', room: 'KITCHEN' })).toEqual({});
    expect(buildTicketChanges(ticket, { title: ' 싱크대 누수 ', description: '물이 새요', room: '' })).toEqual({ title: '싱크대 누수', room: null });
  });
});

describe('알림 link → 임차인 주소', () => {
  it.each([
    ['/tickets/t-1', '/tenant/tickets/t-1'],
    ['/contracts/c-1', '/tenant/contracts/c-1'],
    ['/properties/p-1', null],
    ['//evil.example', null],
    ['https://evil.example', null],
    [null, null],
  ])('%s → %s', (link, expected) => {
    expect(toTenantPath(link)).toBe(expected);
  });
});
