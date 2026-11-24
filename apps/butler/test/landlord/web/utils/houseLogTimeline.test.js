// 하우스 로그 타임라인 계산(#203 P-4b): 축·위치·계약 점·다음 계약·할 일·전체 호실·같은 날 묶음·합치기.
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  buildHomeRows,
  buildTodoItems,
  classifyContracts,
  computeAllHomesAxis,
  computeAxis,
  computeNoticeWindow,
  computeOwnerBand,
  computeTicks,
  getContractYears,
  getElapsedPercent,
  getHomeRowSummary,
  getPopoverPlacement,
  getTimelineStatus,
  groupDotsByDate,
  matchesLogFilter,
  mergeLogsById,
  pickOwnership,
  toContractDots,
  toPercent,
  toRecordDots,
} from '../../../../src/landlord/web/utils/houseLogTimeline';

const TODAY = '2026-11-24';
const notice = (overrides) => ({
  windowStart: '2026-08-28',
  deadline: '2026-12-28',
  safeDeadline: '2026-12-27',
  phase: 'CLOSING_SOON',
  daysUntilDeadline: 34,
  hasDeliveredInTime: false,
  latestNotice: null,
  ...overrides,
});
const contract = (overrides) => ({
  id: 'c1',
  ownershipId: 'o1',
  startDate: '2025-03-01',
  endDate: '2027-02-28',
  status: 'ACTIVE',
  terminatedOn: null,
  previousContractId: null,
  tenantName: '김임차',
  createdAt: '2025-02-20T01:00:00.000Z',
  renewalNotice: notice(),
  ...overrides,
});
const log = (overrides) => ({ id: 'l1', type: 'REPAIR', room: 'KITCHEN', occurredOn: '2026-11-21', isFromPreviousOwner: false, ...overrides });

describe('날짜 계산', () => {
  it('addMonths는 없는 날을 그달 말일로 맞춘다', () => {
    expect(addMonths('2027-08-31', -6)).toBe('2027-02-28');
    expect(addMonths('2027-02-28', -2)).toBe('2026-12-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('통지 구간은 만료 6개월 전 ~ 2개월 전, 권장 마감은 하루 이르다', () => {
    expect(computeNoticeWindow('2027-02-28')).toEqual({ windowStart: '2026-08-28', deadline: '2026-12-28', safeDeadline: '2026-12-27' });
  });

  it('toPercent는 축 안 비율이고 밖은 양 끝으로 붙인다', () => {
    const axis = { start: '2026-01-01', end: '2026-01-11' };
    expect(toPercent('2026-01-06', axis)).toBe(50);
    expect(toPercent('2025-12-01', axis)).toBe(0);
    expect(toPercent('2027-01-01', axis)).toBe(100);
    expect(toPercent('2026-01-01', { start: '2026-01-01', end: '2026-01-01' })).toBe(0);
  });

  it('지난 비율과 계약 연수', () => {
    expect(getElapsedPercent(contract(), TODAY)).toBe(87);
    expect(getElapsedPercent(contract(), '2024-01-01')).toBe(0);
    expect(getContractYears(contract())).toBe(2);
  });
});

describe('계약 나누기 (H-27·H-34)', () => {
  it('진행 중 계약 = 지금, 끝난 계약 = 지난, 지금 계약을 이은 시작 전 계약 = 갱신', () => {
    const past = contract({ id: 'c0', startDate: '2023-03-01', endDate: '2025-02-28', status: 'EXPIRED' });
    const renew = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', previousContractId: 'c1' });
    const result = classifyContracts([renew, contract(), past]);
    expect(result.current.id).toBe('c1');
    expect(result.next.id).toBe('c2');
    expect(result.nextKind).toBe('RENEWAL');
    expect(result.past.map((c) => c.id)).toEqual(['c0']);
  });

  it('previousContractId가 없는 다음 계약은 새 임차인', () => {
    const next = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', tenantName: '이새집' });
    expect(classifyContracts([contract(), next]).nextKind).toBe('NEW_TENANT');
  });

  it('진행 중이 없으면 가장 이른 시작 전 계약이 지금 계약', () => {
    const upcoming = contract({ status: 'UPCOMING', startDate: '2026-12-01', endDate: '2028-11-30' });
    const result = classifyContracts([upcoming]);
    expect(result.current.id).toBe('c1');
    expect(result.next).toBeNull();
  });

  it('중도 해지: 해지일이 오늘 이후면 해지일까지 지금 계약, 새 계약은 새 임차인 다음 계약(C6)', () => {
    const ending = contract({ id: 'old', status: 'TERMINATED', startDate: '2025-03-01', endDate: '2027-02-28', terminatedOn: '2026-12-15' });
    const fresh = contract({ id: 'new', status: 'UPCOMING', startDate: '2026-12-16', endDate: '2028-12-15', previousContractId: null, tenantName: '이새집' });
    const result = classifyContracts([ending, fresh], { today: TODAY });
    expect(result.current).toMatchObject({ id: 'old', endDate: '2026-12-15', originalEndDate: '2027-02-28', isEndingEarly: true });
    expect(result.next?.id).toBe('new');
    expect(result.nextKind).toBe('NEW_TENANT');
    expect(result.past.map((item) => item.id)).not.toContain('old');
    // 해지일이 지났으면 지난 계약
    expect(classifyContracts([ending, fresh], { today: '2026-12-20' }).current.id).toBe('new');
    const items = buildTodoItems({ ...result, today: TODAY });
    expect(items.map((item) => item.id)).toEqual(['move-out', 'move-in']);
    expect(items[0].title).toContain('2026-12-15 중도 해지');
  });

  it('지금 계약이 없고 마지막 계약이 해지 없이 만료됐으면 lapsed(C5)', () => {
    const expired = contract({ id: 'e1', status: 'EXPIRED', startDate: '2024-11-01', endDate: '2026-10-31' });
    expect(classifyContracts([expired]).lapsed?.id).toBe('e1');
    expect(classifyContracts([contract({ id: 't1', status: 'TERMINATED', terminatedOn: '2026-05-01' })]).lapsed).toBeNull();
    expect(classifyContracts([expired, contract()]).lapsed).toBeNull();
  });

  it('계약이 없으면 모두 비어 있다', () => {
    expect(classifyContracts([])).toEqual({ current: null, next: null, nextKind: null, past: [], lapsed: null });
  });

  it('소유가 끝났으면 모두 지난 계약이고, 끝난 날 뒤로 넘는 계약은 그날에서 자른다', () => {
    const result = classifyContracts([contract(), contract({ id: 'c3', startDate: '2027-03-01', status: 'UPCOMING' })], { ownershipEndedOn: '2026-10-31' });
    expect(result.current).toBeNull();
    expect(result.past.map((c) => c.id)).toEqual(['c1']);
    expect(result.past[0].cutOn).toBe('2026-10-31');
  });
});

describe('축 범위', () => {
  it('지금 계약 기간이 기본', () => {
    expect(computeAxis({ current: contract(), today: TODAY })).toEqual({ start: '2025-03-01', end: '2027-02-28', hiddenPastCount: 0 });
  });

  it('다음 계약이 있으면 끝에서 최대 6개월 더', () => {
    const next = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28' });
    expect(computeAxis({ current: contract(), next, today: TODAY }).end).toBe('2027-08-28');
    const short = contract({ id: 'c3', startDate: '2027-03-01', endDate: '2027-05-31' });
    expect(computeAxis({ current: contract(), next: short, today: TODAY }).end).toBe('2027-05-31');
  });

  it('지난 계약은 축을 앞으로 늘리되 지금 계약 시작에서 최대 4년, 넘는 계약은 수로 센다', () => {
    const recent = contract({ id: 'p2', startDate: '2023-03-01', endDate: '2025-02-28', status: 'EXPIRED' });
    expect(computeAxis({ current: contract(), past: [recent], today: TODAY }).start).toBe('2023-03-01');
    const old = contract({ id: 'p0', startDate: '2017-01-01', endDate: '2018-12-31', status: 'EXPIRED' });
    const long = contract({ id: 'p1', startDate: '2019-01-01', endDate: '2023-02-28', status: 'EXPIRED' });
    expect(computeAxis({ current: contract(), past: [old, long, recent], today: TODAY })).toEqual({
      start: '2021-03-01',
      end: '2027-02-28',
      hiddenPastCount: 1,
    });
  });

  it('계약이 없으면 최근 2년, 소유가 끝났으면 끝난 날까지', () => {
    expect(computeAxis({ current: null, today: TODAY })).toEqual({ start: '2024-11-24', end: TODAY, hiddenPastCount: 0 });
    expect(computeAxis({ current: null, today: TODAY, ownershipEndedOn: '2026-10-31' }).end).toBe('2026-10-31');
  });

  it('이전 소유 띠가 있으면 띠 시작까지', () => {
    const current = contract({ startDate: '2026-10-01', endDate: '2028-09-30' });
    expect(computeAxis({ current, band: { start: '2025-03-18' }, today: TODAY }).start).toBe('2025-03-18');
  });
});

describe('이전 소유 띠 (H-30)', () => {
  it('넘겨받은 기록만 세고, 띠는 가장 오래된 기록부터 최대 2년', () => {
    const inherited = [
      log({ id: 'a', occurredOn: '2025-03-18', isFromPreviousOwner: true }),
      log({ id: 'b', occurredOn: '2026-05-20', isFromPreviousOwner: true }),
      log({ id: 'mine', occurredOn: '2026-05-01', isFromPreviousOwner: false }),
    ];
    expect(computeOwnerBand({ myStart: '2026-09-01', inheritedLogs: inherited })).toEqual({ start: '2025-03-18', end: '2026-09-01', count: 2, olderCount: 0 });
  });

  it('2년을 넘는 기록은 그 전 기록으로 센다', () => {
    const inherited = [log({ id: 'a', occurredOn: '2020-01-01', isFromPreviousOwner: true }), log({ id: 'b', occurredOn: '2026-01-01', isFromPreviousOwner: true })];
    expect(computeOwnerBand({ myStart: '2026-09-01', inheritedLogs: inherited })).toEqual({ start: '2024-09-01', end: '2026-09-01', count: 2, olderCount: 1 });
  });

  it('소유 시작을 모르거나 넘겨받은 기록이 없으면 띠가 없다', () => {
    expect(computeOwnerBand({ myStart: null, inheritedLogs: [log({ isFromPreviousOwner: true })] })).toBeNull();
    expect(computeOwnerBand({ myStart: '2026-09-01', inheritedLogs: [log({ occurredOn: '2026-01-01' })] })).toBeNull();
    expect(computeOwnerBand({ myStart: '2026-09-01', inheritedLogs: [log({ occurredOn: '2026-10-01', isFromPreviousOwner: true })] })).toBeNull();
  });
});

describe('점', () => {
  const axis = { start: '2025-03-01', end: '2027-02-28' };

  it('기록 점은 유형·방 거르기를 따르고 방 없음은 NONE', () => {
    const logs = [log({ id: 'a' }), log({ id: 'b', type: 'NOTE', room: null }), log({ id: 'c', occurredOn: '2024-01-01' })];
    expect(toRecordDots(logs, axis, {}).map((dot) => dot.key)).toEqual(['log-a', 'log-b']);
    expect(toRecordDots(logs, axis, { types: ['NOTE'] }).map((dot) => dot.key)).toEqual(['log-b']);
    expect(toRecordDots(logs, axis, { rooms: ['NONE'] }).map((dot) => dot.key)).toEqual(['log-b']);
    expect(toRecordDots(logs, axis, { types: ['REPAIR'], rooms: ['NONE'] })).toEqual([]);
    expect(matchesLogFilter(log(), { types: ['REPAIR', 'NOTE'], rooms: ['KITCHEN'] })).toBe(true);
  });

  it('계약 점: 계약 시작·해지·통지 기록·다음 계약 등록·시작 (축 안만)', () => {
    const past = contract({ id: 'p1', startDate: '2023-03-01', endDate: '2025-02-28', terminatedOn: '2025-01-10', status: 'TERMINATED' });
    const next = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', previousContractId: 'c1', createdAt: '2026-11-20T03:00:00.000Z' });
    const notices = [{ id: 'n1', kind: 'REFUSE_RENEWAL', sentOn: '2026-10-01', deliveredOn: '2026-10-03' }, { id: 'n2', kind: 'CHANGE_TERMS', sentOn: '2026-10-05', deliveredOn: null }];
    const dots = toContractDots({ current: contract(), next, nextKind: 'RENEWAL', past: [past], notices }, { start: '2023-03-01', end: '2027-08-28' });
    expect(dots.map((dot) => [dot.key, dot.date, dot.title])).toEqual([
      ['start-p1', '2023-03-01', '지난 계약 시작'],
      ['end-p1', '2025-01-10', '계약 해지'],
      ['start-c1', '2025-03-01', '계약 시작'],
      ['notice-n1', '2026-10-03', '갱신 거절 통지 기록'],
      ['notice-n2', '2026-10-05', '조건 변경 통지 기록'],
      ['registered-c2', '2026-11-20', '갱신 계약 등록'],
      ['start-c2', '2027-03-01', '갱신 계약 시작 · 2029-02-28까지'],
    ]);
    expect(dots.every((dot) => dot.kind === 'CONTRACT')).toBe(true);
    expect(dots[0].isPast).toBe(true);
    // 축 밖(지난 계약)은 뺀다
    expect(toContractDots({ current: contract(), past: [past] }, axis).map((dot) => dot.key)).toEqual(['start-c1']);
  });

  it('새 임차인 다음 계약의 점 이름', () => {
    const next = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', tenantName: '이새집', createdAt: null });
    const dots = toContractDots({ current: contract(), next, nextKind: 'NEW_TENANT' }, { start: '2025-03-01', end: '2027-08-28' });
    expect(dots.at(-1)).toMatchObject({ title: '새 임차인 계약 시작 · 2029-02-28까지', description: '임차인 이새집 · 시작 전', contractId: 'c2' });
  });

  it('축에서 가까운 점(첫 점과 minGapPercent 안)은 한 묶음, 라벨은 첫 날 ~ 끝 날(B1)', () => {
    const axis = { start: '2025-01-01', end: '2026-12-31' };
    const groups = groupDotsByDate(
      [{ key: 'a', date: '2026-11-08' }, { key: 'b', date: '2026-11-21' }, { key: 'c', date: '2026-11-24' }, { key: 'd', date: '2026-06-01' }],
      { axis, minGapPercent: 2.5 },
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.key)])).toEqual([
      ['2026-06-01', ['d']],
      ['2026-11-08 ~ 2026-11-24', ['a', 'b', 'c']],
    ]);
  });

  it('같은 날 점은 하나로 묶고 날짜 순', () => {
    const groups = groupDotsByDate([{ key: 'b', date: '2026-02-01' }, { key: 'a', date: '2026-01-01' }, { key: 'c', date: '2026-02-01' }]);
    expect(groups.map((group) => [group.date, group.items.map((item) => item.key)])).toEqual([
      ['2026-01-01', ['a']],
      ['2026-02-01', ['b', 'c']],
    ]);
  });

  it('id로 합치면 처음 본 것을 남긴다', () => {
    expect(mergeLogsById([log({ id: 'a', title: '1' }), log({ id: 'b' })], [log({ id: 'a', title: '2' })]).map((item) => [item.id, item.title])).toEqual([
      ['a', '1'],
      ['b', undefined],
    ]);
  });

  it('작은 카드 자리', () => {
    expect(getPopoverPlacement(90)).toBe('end');
    expect(getPopoverPlacement(10)).toBe('start');
    expect(getPopoverPlacement(50)).toBe('center');
  });

  it('눈금은 축 길이에 따라 간격을 바꾸고 양 끝 가까운 것은 뺀다', () => {
    const ticks = computeTicks({ start: '2025-03-01', end: '2027-02-28' });
    expect(ticks.map((tick) => tick.label)).toEqual(['2025-04', '2025-07', '2025-10', '2026-01', '2026-04', '2026-07', '2026-10', '2027-01']);
    expect(ticks.every((tick) => tick.percent >= 4 && tick.percent <= 96)).toBe(true);
    expect(computeTicks({ start: '2021-03-01', end: '2027-02-28' }).map((tick) => tick.label)).toEqual(['2022-01', '2023-01', '2024-01', '2025-01', '2026-01']);
  });
});

describe('타임라인 머리 칩', () => {
  it('상태별 칩', () => {
    expect(getTimelineStatus({ current: null })).toEqual({ tone: 'default', label: '계약 없음' });
    expect(getTimelineStatus({ current: contract(), nextKind: 'RENEWAL' }).label).toBe('갱신 확정');
    expect(getTimelineStatus({ current: contract(), nextKind: 'NEW_TENANT' }).label).toBe('다음 임차인 입주 예정');
    expect(getTimelineStatus({ current: contract(), renewalNotice: notice() }).label).toBe('갱신 거절 통지 기간');
    expect(getTimelineStatus({ current: contract(), renewalNotice: notice({ hasDeliveredInTime: true }) }).label).toBe('통지 도달 기록 있음');
    expect(getTimelineStatus({ current: contract(), renewalNotice: notice({ phase: 'CLOSED' }) }).label).toBe('통지 마감 지남');
    expect(getTimelineStatus({ current: contract(), renewalNotice: notice({ phase: 'BEFORE_WINDOW' }) })).toBeNull();
  });
});

describe('앞으로 할 일 (U-16)', () => {
  const ids = (items) => items.map((item) => item.id);

  it('통지 기간: 권장 마감 D-n·[통지 기록하기], 만료·[계약 보기], 퇴거 점검은 알림만', () => {
    const items = buildTodoItems({ current: contract(), today: TODAY });
    expect(ids(items)).toEqual(['notice-deadline', 'contract-end', 'move-out-later']);
    expect(items[0]).toMatchObject({ tone: 'crit', title: '갱신 거절 통지 권장 마감 · 2026-12-27', dday: 33, action: { kind: 'NOTICE', contractId: 'c1' } });
    expect(items[1]).toMatchObject({ title: '계약 만료 · 2027-02-28', dday: 96, action: { kind: 'CONTRACT' } });
    expect(items[2].action).toBeUndefined();
  });

  it('통지 기간 전이면 "아직 멀었어요"', () => {
    const items = buildTodoItems({ current: contract({ renewalNotice: notice({ phase: 'BEFORE_WINDOW', windowStart: '2028-03-31', safeDeadline: '2028-07-29' }) }), today: TODAY });
    expect(items[0]).toMatchObject({ id: 'notice-window', title: '갱신 거절 통지 기간 · 2028-03-31 ~ 2028-07-29', description: '아직 멀었어요.' });
  });

  it('통지 없이 마감이 지나면 묵시적 갱신 안내와 [갱신 계약 등록]', () => {
    const items = buildTodoItems({ current: contract({ renewalNotice: notice({ phase: 'CLOSED' }) }), today: '2027-01-05' });
    expect(items[0]).toMatchObject({ id: 'implicit-renewal', action: { kind: 'RENEW', contractId: 'c1' } });
    expect(items[0].description).toContain('같은 조건 2년 갱신으로 봐요');
  });

  it('기간 안에 도달한 통지가 있으면 통지 할 일 대신 기록 있음', () => {
    const items = buildTodoItems({ current: contract({ renewalNotice: notice({ hasDeliveredInTime: true, latestNotice: { deliveredOn: '2026-10-03' } }) }), today: TODAY });
    expect(items[0]).toMatchObject({ id: 'notice-done', tone: 'ok' });
    expect(items[0].description).toContain('2026-10-03');
  });

  it('갱신 확정: 통지 할 일이 빠지고 갱신 계약·다음 통지 기간', () => {
    const next = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', previousContractId: 'c1' });
    const items = buildTodoItems({ current: contract(), next, nextKind: 'RENEWAL', today: TODAY });
    expect(ids(items)).toEqual(['renewed', 'next-window']);
    expect(items[0]).toMatchObject({ title: '갱신 계약 등록됨 · 2027-03-01부터 2년', action: { kind: 'CONTRACT', contractId: 'c2' } });
    expect(items[1].title).toBe('다음 통지 기간 · 2028-08-28 ~ 2028-12-27');
  });

  it('새 임차인: 지금 임차인 통지 → 퇴거 점검 → 입주 인수인계(둘은 알림만)', () => {
    const next = contract({ id: 'c2', startDate: '2027-03-01', endDate: '2029-02-28', status: 'UPCOMING', tenantName: '이새집' });
    const items = buildTodoItems({ current: contract(), next, nextKind: 'NEW_TENANT', today: TODAY });
    expect(ids(items)).toEqual(['notice-deadline', 'move-out', 'move-in']);
    expect(items[0]).toMatchObject({ tone: 'warn', title: '지금 임차인에게 갱신 거절 통지 · 권장 마감 2026-12-27' });
    expect(items[1]).toMatchObject({ title: '퇴거 점검 · 2027-02-28 (김임차)', dday: 96 });
    expect(items[2]).toMatchObject({ title: '입주 인수인계 · 2027-03-01 (이새집)', dday: 97 });
    expect(items[1].action).toBeUndefined();
    expect(items[2].action).toBeUndefined();
  });

  it('계약이 없거나 renewalNotice가 없으면(끝난 소유·해지) 할 일 없음', () => {
    expect(buildTodoItems({ current: null, today: TODAY })).toEqual([]);
  });

  it('만료 뒤 통지 도달 기록이 없으면 묵시적 갱신 안내(C5), 기간 안 도달 기록이 있거나 2년 지나면 없음', () => {
    const lapsed = contract({ id: 'old', status: 'EXPIRED', startDate: '2024-11-01', endDate: '2026-10-31', renewalNotice: null });
    const items = buildTodoItems({ current: null, lapsed, lapsedNotices: [], today: TODAY });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'implicit-renewal-lapsed', action: { kind: 'RENEW', contractId: 'old' } });
    expect(items[0].title).toContain('2026-10-31');
    expect(buildTodoItems({ current: null, lapsed, lapsedNotices: [{ id: 'n1', deliveredOn: '2026-07-01' }], today: TODAY })).toEqual([]);
    expect(buildTodoItems({ current: null, lapsed, lapsedNotices: [{ id: 'n2', deliveredOn: '2026-09-15' }], today: TODAY })).toHaveLength(1);
    expect(buildTodoItems({ current: null, lapsed, lapsedNotices: [], today: '2028-12-01' })).toEqual([]);
  });

  it('지금 계약이 없으면 통지 점을 그리지 않는다(오류 없음)', () => {
    const axis = { start: '2025-01-01', end: '2027-12-31' };
    expect(() => toContractDots({ current: null, next: null, nextKind: null, past: [], notices: [{ id: 'n', kind: 'REFUSE_RENEWAL', sentOn: '2026-08-01', deliveredOn: null }] }, axis)).not.toThrow();
    expect(buildTodoItems({ current: contract({ renewalNotice: null }), today: TODAY })).toEqual([]);
  });
});

describe('전체 호실 (H-28)', () => {
  const home = (id, name) => ({ id, displayName: name });
  const ownership = (id, propertyId, overrides) => ({ id, property: { id: propertyId }, endedAt: null, endReason: null, ...overrides });

  it('소유 관계 고르기: 활성 우선, 없으면 가장 최근에 끝난 것', () => {
    const list = [
      ownership('o1', 'p1', { endedAt: '2024-01-01T00:00:00Z' }),
      ownership('o2', 'p1', { endedAt: '2025-01-01T00:00:00Z' }),
      ownership('o3', 'p2'),
      ownership('o4', 'p2', { endedAt: '2025-01-01T00:00:00Z' }),
    ];
    expect(pickOwnership(list, 'p1').id).toBe('o2');
    expect(pickOwnership(list, 'p2').id).toBe('o3');
    expect(pickOwnership(list, 'p9')).toBeNull();
  });

  const rowsFixture = (filter) =>
    buildHomeRows({
      homes: [home('p1', '가 호실'), home('p2', '나 호실'), home('p3', '다 호실'), home('p4', '라 호실(매도)')],
      ownerships: [ownership('o1', 'p1'), ownership('o2', 'p2'), ownership('o3', 'p3'), ownership('o4', 'p4', { endedAt: '2026-10-31T03:00:00Z', endReason: 'SOLD' })],
      contracts: [
        contract({ id: 'c1', ownershipId: 'o1', renewalNotice: notice({ phase: 'BEFORE_WINDOW', deadline: '2028-02-29' }), startDate: '2026-05-01', endDate: '2028-04-30' }),
        contract({ id: 'c2', ownershipId: 'o2' }),
        contract({ id: 'c4', ownershipId: 'o4', startDate: '2025-01-01', endDate: '2026-12-31' }),
      ],
      logs: [log({ id: 'a', propertyId: 'p1', type: 'REPAIR' }), log({ id: 'b', propertyId: 'p2', type: 'NOTE' }), log({ id: 'c', property: { id: 'p4' }, type: 'INSPECTION' })],
      filter,
      today: TODAY,
    });

  it('통지 마감 가까운 순 → 계약 있는 호실 → 계약 없는 호실 → 매도 호실', () => {
    const rows = rowsFixture({});
    expect(rows.map((row) => row.property.id)).toEqual(['p2', 'p1', 'p3', 'p4']);
    expect(rows[3]).toMatchObject({ endedOn: '2026-10-31', isSold: true, current: null, barEnd: '2026-10-31' });
    expect(rows[3].bar.id).toBe('c4');
    expect(rows.every((row) => row.matchCount === null && row.isDimmed === false)).toBe(true);
  });

  it('거르기는 기록만 줄이고 맞는 기록이 없는 호실은 흐리게(순서는 그대로)', () => {
    const rows = rowsFixture({ types: ['REPAIR'] });
    expect(rows.map((row) => row.property.id)).toEqual(['p2', 'p1', 'p3', 'p4']);
    expect(rows.map((row) => [row.matchCount, row.isDimmed])).toEqual([
      [0, true],
      [1, false],
      [0, true],
      [0, true],
    ]);
    expect(rows[1].current.id).toBe('c1');
  });

  it('줄 요약 칩: 마감·만료 당일과 지난 날은 D-day·D+n 지남(D--1 없음)', () => {
    expect(getHomeRowSummary({ current: contract({ renewalNotice: notice({ phase: 'CLOSING_SOON', safeDeadline: '2026-11-23' }) }) }, TODAY).badge).toBe('권장 마감 D+1 지남');
    expect(getHomeRowSummary({ current: contract({ renewalNotice: notice({ phase: 'CLOSING_SOON', safeDeadline: TODAY }) }) }, TODAY).badge).toBe('권장 마감 D-day');
    expect(getHomeRowSummary({ current: contract({ endDate: TODAY, renewalNotice: null }) }, TODAY).badge).toBe('만료 D-day');
  });

  it('줄 요약 칩', () => {
    expect(getHomeRowSummary({ endedOn: '2026-10-31', isSold: true }, TODAY)).toMatchObject({ badge: '2026-10-31 매도' });
    expect(getHomeRowSummary({ current: null }, TODAY).badge).toBe('계약 없음');
    expect(getHomeRowSummary({ current: contract(), nextKind: 'RENEWAL' }, TODAY).badge).toBe('갱신 확정');
    expect(getHomeRowSummary({ current: contract() }, TODAY)).toEqual({ tone: 'danger', badge: '권장 마감 D-33', next: '갱신 거절 통지 기록 없음' });
    expect(getHomeRowSummary({ current: contract({ renewalNotice: notice({ phase: 'OPEN' }) }) }, TODAY).tone).toBe('warning');
    expect(getHomeRowSummary({ current: contract({ renewalNotice: notice({ phase: 'BEFORE_WINDOW', windowStart: '2027-03-14' }) }) }, TODAY)).toMatchObject({
      badge: '통지 기간 전',
      next: '통지 기간 2027-03-14부터',
    });
    expect(getHomeRowSummary({ current: contract({ renewalNotice: null }) }, TODAY).badge).toBe('만료 D-96');
    expect(getHomeRowSummary({ current: contract({ renewalNotice: notice({ hasDeliveredInTime: true }) }) }, TODAY).next).toBe('통지 도달 기록 있음');
    expect(getHomeRowSummary({ current: contract({ renewalNotice: notice({ phase: 'CLOSED' }) }) }, TODAY).next).toBe('통지 없이 마감 지남');
  });

  it('전체 축은 모든 막대와 오늘을 담는다(오늘에서 앞뒤 최대 4년)', () => {
    expect(computeAllHomesAxis(rowsFixture({}), TODAY)).toEqual({ start: '2025-01-01', end: '2028-04-30' });
    expect(computeAllHomesAxis([], TODAY)).toEqual({ start: '2025-11-24', end: TODAY });
    const far = [{ bar: { startDate: '2010-01-01' }, barEnd: '2040-01-01' }];
    expect(computeAllHomesAxis(far, TODAY)).toEqual({ start: '2022-11-24', end: '2030-11-24' });
  });
});
