import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  formatDday,
  formatManwon,
  formatMonthDay,
  formatMonthDayKST,
  formatPeriod,
  formatRentDay,
  getTenantStatusBadge,
  getTodayKST,
} from '../../src/shared/contractFormat';
import { getNextRentDays, sortTenantContracts, toContractTerms } from '../../src/tenant/utils/home';

describe('계약 표기', () => {
  it('금액', () => {
    expect(formatManwon(50000000)).toBe('5,000만 원');
    expect(formatManwon(1200000)).toBe('120만 원');
    expect(formatManwon(520000000)).toBe('5억 2,000만 원');
    expect(formatManwon(1234567)).toBe('1,234,567원');
    expect(formatManwon(null)).toBeNull();
  });

  it('날짜', () => {
    expect(formatPeriod('2026-12-01', '2028-11-30')).toBe('2026.12.01 ~ 2028.11.30');
    expect(formatMonthDay('2026-12-25')).toBe('12월 25일');
    expect(formatMonthDayKST('2026-11-18T08:00:00Z')).toBe('11월 18일');
    expect(formatMonthDayKST('2026-11-18T16:00:00Z')).toBe('11월 19일');
    expect(getTodayKST(new Date('2026-11-11T16:00:00Z'))).toBe('2026-11-12');
    expect(daysBetween('2026-12-11', '2026-12-25')).toBe(14);
    expect(formatDday(14)).toBe('D-14');
    expect(formatDday(0)).toBe('D-DAY');
  });

  it('입금일', () => {
    expect(formatRentDay(25)).toBe('매월 25일');
    expect(formatRentDay(31)).toBe('매월 말일');
    expect(formatRentDay(null)).toBeNull();
  });

  it('임차인 상태 칩', () => {
    expect(getTenantStatusBadge('ACTIVE')).toEqual({ tone: 'success', label: '계약 중' });
    expect(getTenantStatusBadge('NEW')).toEqual({ tone: 'default', label: 'NEW' });
  });
});

describe('임차인 홈 도우미', () => {
  it('진행 중 → 시작 전 → 끝난 계약, 같은 묶음은 끝나는 날 순', () => {
    const list = [
      { id: 'ended', status: 'EXPIRED', endDate: '2025-01-01' },
      { id: 'upcoming', status: 'UPCOMING', endDate: '2029-01-01' },
      { id: 'active-late', status: 'ACTIVE', endDate: '2028-01-01' },
      { id: 'soon', status: 'EXPIRING_SOON', endDate: '2027-01-01' },
    ];
    expect(sortTenantContracts(list).map((c) => c.id)).toEqual(['soon', 'active-late', 'upcoming', 'ended']);
  });

  it('다음 월세까지 남은 날', () => {
    expect(getNextRentDays({ nextRentPaymentDate: '2026-12-25' }, '2026-12-11')).toBe(14);
    expect(getNextRentDays({ nextRentPaymentDate: null }, '2026-12-11')).toBeNull();
  });

  it('계약 응답 → 계약 조건 카드 값', () => {
    const terms = toContractTerms({
      property: { displayName: '잠실 101동 1203호' },
      landlord: { name: '김임대' },
      leaseType: 'MONTHLY',
      deposit: 1,
      monthlyRent: 2,
      rentPaymentDay: 25,
      startDate: 'a',
      endDate: 'b',
      memo: '보이면 안 됨',
    });
    expect(terms).toEqual({
      propertyDisplayName: '잠실 101동 1203호',
      landlordName: '김임대',
      leaseType: 'MONTHLY',
      deposit: 1,
      monthlyRent: 2,
      rentPaymentDay: 25,
      startDate: 'a',
      endDate: 'b',
    });
  });
});
