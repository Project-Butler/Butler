import { describe, expect, it, vi } from 'vitest';
import { buildTicketSummaryTitle, filterActionableTickets, findTicketSegment, TICKET_STATUS_SEGMENTS, toFilterParam } from '../../../../src/landlord/web/utils/ticketView';
import { buildNotificationMenu, toLandlordWebPath } from '../../../../src/landlord/web/utils/notificationMenu';

describe('PC 수리 요청 표시 계산', () => {
  it('상태 세그먼트: 처리할 요청(접수+처리 중)·전체·완료·취소, 모르는 key 는 처리할 요청', () => {
    expect(TICKET_STATUS_SEGMENTS.map((segment) => [segment.key, segment.status])).toEqual([
      ['todo', 'OPEN,IN_PROGRESS'],
      ['all', undefined],
      ['done', 'DONE'],
      ['canceled', 'CANCELED'],
    ]);
    expect(findTicketSegment('nope').key).toBe('todo');
  });

  it('처리할 수 있는 요청만 센다 — 소유가 끝난 호실에 남은 요청(isReadOnly)은 뺀다(사이드바 개수·오늘 할 일)', () => {
    expect(filterActionableTickets([{ id: 'a', isReadOnly: false }, { id: 'b', isReadOnly: true }, { id: 'c' }]).map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterActionableTickets(undefined)).toEqual([]);
  });

  it('거르기 값은 보기 순서대로 쉼표로, 없으면 undefined', () => {
    const options = [{ value: 'A' }, { value: 'B' }, { value: 'C' }];
    expect(toFilterParam(options, ['C', 'A'])).toBe('A,C');
    expect(toFilterParam(options, [])).toBeUndefined();
  });

  it.each([
    [{ room: 'KITCHEN', category: 'REPAIR' }, '주방 수리 완료'],
    [{ room: null, category: 'REPAIR' }, '수리 완료'],
    [{ room: null, category: 'INSPECTION' }, '점검 완료'],
    [{ room: 'OTHER', category: 'REPAIR' }, '수리 완료'],
    [{ room: 'BATHROOM', category: 'OTHER' }, '욕실·화장실 요청 처리 완료'],
  ])('완료 요약 제목(서버 buildTicketSummaryTitle 과 같은 리터럴) %o → %s', (ticket, title) => {
    expect(buildTicketSummaryTitle(ticket)).toBe(title);
  });
});

describe('PC 위 막대 종', () => {
  it('알림 link 를 임대인 주소로, 앱 밖 주소는 null', () => {
    expect(toLandlordWebPath('/tickets/t1')).toBe('/landlord/tickets/t1');
    expect(toLandlordWebPath('/landlord/tickets/t1')).toBe('/landlord/tickets/t1');
    expect(toLandlordWebPath('//evil.example')).toBeNull();
    expect(toLandlordWebPath('https://evil.example')).toBeNull();
    expect(toLandlordWebPath(null)).toBeNull();
  });

  it('안 읽은 알림을 갱신 거절 통지 위에 두고, 누르면 읽음 처리 후 그 화면으로', () => {
    const onRead = vi.fn();
    const onOpenPath = vi.fn();
    const renewal = { emptyText: '새 알림이 없어요', footer: 'f', items: [{ id: 'r1', title: '인증 만료 예정' }] };
    const menu = buildNotificationMenu({
      unread: [{ id: 'n1', title: '새 수리 요청이 들어왔어요', body: '101동 · 주방 — 누수', link: '/tickets/t1', createdAt: '2026-11-25T03:00:00Z' }],
      renewal,
      now: new Date('2026-11-25T03:10:00Z'),
      onRead,
      onOpenPath,
    });
    expect(menu.items.map((item) => item.id)).toEqual(['n-n1', 'r1']);
    expect(menu.items[0].description).toBe('101동 · 주방 — 누수 · 10분 전');
    expect(menu.footer).toBe('f');
    menu.items[0].onClick();
    expect(onRead).toHaveBeenCalledWith('n1');
    expect(onOpenPath).toHaveBeenCalledWith('/landlord/tickets/t1');
  });
});
