// 일정·알림 화면과 갱신 거절 통지 카드의 계산(#163).
import { describe, expect, it } from 'vitest';
import { formatNotificationTime } from '../../src/shared/notifications/formatNotificationTime';
import {
  formatScheduleDate,
  formatWeekMonthLabel,
  getRenewalNoticePhaseBadge,
  getRenewalNoticeWarning,
  getWeekDates,
  isToggleOn,
  setToggle,
  toLandlordPath,
} from '../../src/landlord/app/utils/scheduleView';

describe('주 띠', () => {
  it('그 날이 든 주를 일요일부터 7일로', () => {
    expect(getWeekDates('2026-11-19')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    // 일요일은 그 주의 첫날
    expect(getWeekDates('2026-11-15')[0]).toBe('2026-11-15');
  });

  it('두 달에 걸친 주는 목요일이 든 달로 이름을 붙인다', () => {
    expect(formatWeekMonthLabel(getWeekDates('2026-11-30'))).toBe('2026년 12월');
    expect(formatWeekMonthLabel(getWeekDates('2026-10-26'))).toBe('2026년 10월');
  });

  it('날짜는 "11월 25일 (수)"', () => {
    expect(formatScheduleDate('2026-11-25')).toBe('11월 25일 (수)');
  });
});

describe('알림 받기 토글 ↔ mutedTypes', () => {
  const RENEWAL = ['RENEWAL_NOTICE_WINDOW_OPEN', 'RENEWAL_NOTICE_DEADLINE_SOON'];

  it('토글의 type 중 하나라도 꺼져 있으면 꺼진 것', () => {
    expect(isToggleOn([], RENEWAL)).toBe(true);
    expect(isToggleOn(['RENEWAL_NOTICE_WINDOW_OPEN'], RENEWAL)).toBe(false);
  });

  it('끄면 type 을 모두 더하고(중복 없이), 켜면 모두 뺀다. 다른 type 은 그대로', () => {
    expect(setToggle(['RENT_PAYMENT_DUE', 'RENEWAL_NOTICE_WINDOW_OPEN'], RENEWAL, false)).toEqual(['RENT_PAYMENT_DUE', ...RENEWAL]);
    expect(setToggle(['RENT_PAYMENT_DUE', ...RENEWAL], RENEWAL, true)).toEqual(['RENT_PAYMENT_DUE']);
  });
});

describe('알림', () => {
  it('link 는 임대인 주소로 바꾸고, 앱 밖 주소는 열지 않는다', () => {
    expect(toLandlordPath('/contracts/c1')).toBe('/landlord/contracts/c1');
    expect(toLandlordPath('/landlord/contracts/c1')).toBe('/landlord/contracts/c1');
    expect(toLandlordPath('https://evil.example')).toBeNull();
    expect(toLandlordPath('//evil.example')).toBeNull();
    expect(toLandlordPath(null)).toBeNull();
  });

  it('시각: 방금 · n분 전 · n시간 전 · 그 밖은 KST 날짜', () => {
    const now = new Date('2026-11-19T03:00:00Z');
    expect(formatNotificationTime('2026-11-19T02:59:40Z', now)).toBe('방금');
    expect(formatNotificationTime('2026-11-19T02:30:00Z', now)).toBe('30분 전');
    expect(formatNotificationTime('2026-11-18T23:00:00Z', now)).toBe('4시간 전');
    // 2026-11-17T16:00Z = KST 11월 18일 01시
    expect(formatNotificationTime('2026-11-17T16:00:00Z', now)).toBe('11월 18일');
  });
});

describe('갱신 거절 통지 카드', () => {
  const summary = (overrides) => ({
    windowStart: '2026-05-31',
    deadline: '2026-09-30',
    safeDeadline: '2026-09-29',
    phase: 'OPEN',
    daysUntilDeadline: 100,
    hasDeliveredInTime: false,
    latestNotice: null,
    ...overrides,
  });

  it('기간 안 도달 기록이 있으면 "통지 완료"이고 경고하지 않는다', () => {
    expect(getRenewalNoticePhaseBadge(summary({ hasDeliveredInTime: true })).label).toBe('통지 완료');
    expect(getRenewalNoticeWarning(summary({ hasDeliveredInTime: true }))).toBeNull();
  });

  it('구간마다 안내: 기간 전 · 기간 중(권장 마감) · 마감 임박(남은 날) · 지남(2년 갱신)', () => {
    expect(getRenewalNoticeWarning(summary({ phase: 'BEFORE_WINDOW' })).text).toContain('2026-05-31부터');
    expect(getRenewalNoticeWarning(summary()).text).toContain('2026-09-29까지');
    expect(getRenewalNoticeWarning(summary({ phase: 'CLOSING_SOON', daysUntilDeadline: 12 }))).toEqual(
      expect.objectContaining({ tone: 'warn', text: expect.stringContaining('12일') }),
    );
    expect(getRenewalNoticeWarning(summary({ phase: 'CLOSED' })).text).toContain('2년 갱신');
    expect(getRenewalNoticePhaseBadge(summary({ phase: 'CLOSING_SOON' }))).toEqual({ tone: 'danger', label: '마감 임박' });
  });
});
