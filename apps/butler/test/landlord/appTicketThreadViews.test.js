import { describe, expect, it } from 'vitest';
import { buildLocation, resolveViewKey } from '../../src/landlord/web/routes';
import {
  canCancelTicket,
  canOpenTicketThread,
  getPrimaryTicketAction,
  getRequesterLabel,
  getTicketStatusBadge,
  toCompleteBody,
  toTicketRows,
} from '../../src/landlord/web/utils/ticketView';
import { formatMessageDay, formatMessageTime, getThreadTitle, groupMessagesByDay, isMyMessage } from '../../src/landlord/app/utils/threadView';

const ticket = (overrides = {}) => ({
  id: 't1',
  category: 'REPAIR',
  status: 'OPEN',
  isReadOnly: false,
  requester: { id: 'u2', name: '김임차', role: 'TENANT' },
  createdAt: '2026-10-19T05:30:00.000Z',
  closedAt: null,
  cost: null,
  ...overrides,
});

describe('수리·점검 (M09)', () => {
  it('상태 배지', () => {
    expect(getTicketStatusBadge('OPEN')).toEqual({ label: '확인 필요', tone: 'warning' });
    expect(getTicketStatusBadge('DONE').tone).toBe('success');
  });

  it('주 동작: 접수 → 처리 시작, 처리 중 → 완료 처리, 끝났거나 읽기 전용이면 없음', () => {
    expect(getPrimaryTicketAction(ticket())).toBe('START');
    expect(getPrimaryTicketAction(ticket({ status: 'IN_PROGRESS' }))).toBe('COMPLETE');
    expect(getPrimaryTicketAction(ticket({ status: 'DONE', isReadOnly: true }))).toBeNull();
    expect(getPrimaryTicketAction(ticket({ isReadOnly: true }))).toBeNull();
    expect(canCancelTicket(ticket({ status: 'IN_PROGRESS' }))).toBe(true);
    expect(canCancelTicket(ticket({ status: 'CANCELED' }))).toBe(false);
  });

  it('요청자·대화: 임차인 요청만 대화가 열린다', () => {
    expect(getRequesterLabel(ticket())).toBe('임차인 김임차 요청');
    expect(canOpenTicketThread(ticket())).toBe(true);
    const mine = ticket({ requester: { id: 'u1', name: '박임대', role: 'LANDLORD' } });
    expect(getRequesterLabel(mine)).toBe('내가 등록');
    expect(canOpenTicketThread(mine)).toBe(false);
  });

  it('상세 행: 한국 시간 접수일, 완료일·비용은 있을 때만', () => {
    expect(toTicketRows(ticket()).map((row) => row.label)).toEqual(['유형', '요청', '접수일']);
    expect(toTicketRows(ticket())[2].value).toBe('2026-10-19 14:30');
    const done = toTicketRows(ticket({ status: 'DONE', closedAt: '2026-10-20T16:00:00.000Z', cost: 150000 }));
    expect(done.find((row) => row.label === '완료일').value).toBe('2026-10-21');
    expect(done.find((row) => row.label === '비용').value).toBe('150,000원');
  });

  it('완료 처리 바디: 빈 값은 보내지 않는다', () => {
    expect(toCompleteBody({ resolutionNote: '  ', cost: '' })).toEqual({ status: 'DONE' });
    expect(toCompleteBody({ resolutionNote: ' 펌프 교체 ', cost: '150,000' })).toEqual({ status: 'DONE', resolutionNote: '펌프 교체', cost: 150000 });
    expect(toCompleteBody({ resolutionNote: '', cost: '0' })).toEqual({ status: 'DONE', cost: 0 });
  });

  it('주소: 등록이 상세보다 먼저 맞고, 호실 필터는 주소에 남는다', () => {
    expect(resolveViewKey('/landlord/tickets/new')).toBe('ticketRegister');
    expect(resolveViewKey('/landlord/tickets/abc')).toBe('ticketDetail');
    expect(resolveViewKey('/landlord/threads/abc')).toBe('thread');
    expect(buildLocation('tickets', { propertyId: 'p1' })).toEqual({ pathname: '/landlord/tickets', search: '?propertyId=p1' });
    expect(buildLocation('ticketDetail', { ticketId: 't1', complete: true }).state).toEqual({ complete: true });
  });
});

describe('소통 (M10)', () => {
  const thread = { title: '101동 1203호 계약', participants: [{ id: 'me', name: '박임대' }, { id: 'u2', name: '김임차' }] };

  it('제목은 상대 이름 · 대화 제목', () => {
    expect(getThreadTitle(thread, 'me')).toBe('김임차 · 101동 1203호 계약');
    expect(getThreadTitle({ title: null, participants: [] }, 'me')).toBe('대화');
  });

  it('날짜·시각은 한국 시간', () => {
    expect(formatMessageDay('2026-10-18T15:30:00.000Z')).toBe('2026-10-19 (월)');
    expect(formatMessageTime('2026-10-18T15:30:00.000Z')).toBe('00:30');
  });

  it('날짜별로 묶고, 내 메시지를 가린다', () => {
    const messages = [
      { id: 'm1', sender: { id: 'u2' }, sentAt: '2026-10-18T10:00:00.000Z' },
      { id: 'm2', sender: { id: 'me' }, sentAt: '2026-10-18T14:59:00.000Z' },
      { id: 'm3', sender: { id: 'u2' }, sentAt: '2026-10-18T15:00:00.000Z' },
    ];
    expect(groupMessagesByDay(messages).map((group) => [group.key, group.items.length])).toEqual([
      ['2026-10-18', 2],
      ['2026-10-19', 1],
    ]);
    expect(isMyMessage(messages[1], 'me')).toBe(true);
    expect(isMyMessage(messages[0], 'me')).toBe(false);
  });
});
