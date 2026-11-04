import { describe, expect, it } from 'vitest';
import { EMPTY_CONTRACT_FORM, validateContractForm } from '../../src/components/ContractForm/ContractForm';
import { buildLocation, resolveViewKey } from '../../src/routes';
import {
  formatContractAmount,
  formatDday,
  formatManwon,
  formatPhone,
  formatWon,
  getContractDdayBadge,
  getContractStatusBadge,
  getDdayTone,
  getMaxTerminationDate,
  getRenewalPeriod,
  isContractDateInRange,
  isValidPhone,
  toPhoneDigits,
} from '../../src/utils/contract';

describe('계약 금액 표기', () => {
  it('원 단위와 만 단위로 쓴다', () => {
    expect(formatWon(50000000)).toBe('50,000,000원');
    expect(formatManwon(50000000)).toBe('5,000만');
    expect(formatManwon(500000)).toBe('50만');
    expect(formatManwon(1234567)).toBe('1,234,567원');
    expect(formatManwon(0)).toBe('0원');
    expect(formatManwon(99990000)).toBe('9,999만');
    expect(formatManwon(100000000)).toBe('1억');
    expect(formatManwon(520000000)).toBe('5억 2,000만');
    expect(formatManwon(5000000000000)).toBe('5조');
    expect(formatManwon(1234567890000)).toBe('1조 2,345억 6,789만');
    expect(formatManwon(100012345)).toBe('100,012,345원');
  });

  it('월세는 보증금 / 월세, 전세는 보증금만', () => {
    expect(formatContractAmount({ leaseType: 'MONTHLY', deposit: 10000000, monthlyRent: 500000 })).toBe('1,000만 / 50만');
    expect(formatContractAmount({ leaseType: 'JEONSE', deposit: 200000000, monthlyRent: 0 })).toBe('전세 2억');
  });
});

describe('연락처', () => {
  it('숫자만 남기고 하이픈으로 나눠 보여 준다', () => {
    expect(toPhoneDigits('010-1234-5678')).toBe('01012345678');
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('0101234567')).toBe('010-123-4567');
    expect(formatPhone('0101')).toBe('010-1');
    expect(formatPhone('010')).toBe('010');
  });

  it('010으로 시작하는 10~11자리만 받는다(D-03)', () => {
    expect(isValidPhone('01012345678')).toBe(true);
    expect(isValidPhone('0101234567')).toBe(true);
    expect(isValidPhone('0212345678')).toBe(false);
    expect(isValidPhone('010123456')).toBe(false);
  });
});

describe('D-day', () => {
  it('오늘·남음·지남을 나눠 쓴다', () => {
    expect(formatDday(0)).toBe('D-day');
    expect(formatDday(7)).toBe('D-7');
    expect(formatDday(-3)).toBe('D+3 지남');
  });

  it('7일 이하·지남만 danger(D-17)', () => {
    expect(getDdayTone(8)).toBe('default');
    expect(getDdayTone(7)).toBe('danger');
    expect(getDdayTone(-1)).toBe('danger');
  });

  it('끝난 계약에는 D-day 칩을 붙이지 않는다', () => {
    expect(getContractDdayBadge({ status: 'EXPIRING_SOON', daysUntilEnd: 5 })).toEqual({ tone: 'danger', label: 'D-5' });
    expect(getContractDdayBadge({ status: 'TERMINATED', daysUntilEnd: 5 })).toBeNull();
  });

  it('상태 칩은 Badge tone만 쓴다', () => {
    expect(getContractStatusBadge({ status: 'ACTIVE' })).toEqual({ tone: 'success', label: '진행 중' });
    expect(getContractStatusBadge({ status: 'EXPIRING_SOON' })).toEqual({ tone: 'warning', label: '만료 임박' });
    expect(getContractStatusBadge({ status: 'TERMINATED' }).tone).toBe('default');
  });

  it('소유가 끝난 계약은 끝남으로 보이고 D-day가 없다. 만료·해지 표시는 그대로다', () => {
    expect(getContractStatusBadge({ status: 'ACTIVE', endReason: 'SOLD' })).toEqual({ tone: 'default', label: '끝남' });
    expect(getContractStatusBadge({ status: 'UPCOMING', endReason: 'SOLD' }).label).toBe('끝남');
    expect(getContractStatusBadge({ status: 'TERMINATED', endReason: 'SOLD' }).label).toBe('해지');
    expect(getContractDdayBadge({ status: 'ACTIVE', endReason: 'SOLD', daysUntilEnd: 5 })).toBeNull();
  });
});

describe('날짜 계산', () => {
  it('갱신 기간 = 이전 종료일 다음 날부터 2년(D-14)', () => {
    expect(getRenewalPeriod('2026-10-20')).toEqual({ startDate: '2026-10-21', endDate: '2028-10-20' });
    expect(getRenewalPeriod('2026-12-31')).toEqual({ startDate: '2027-01-01', endDate: '2028-12-31' });
    // 윤일 다음 날 시작
    expect(getRenewalPeriod('2028-02-28')).toEqual({ startDate: '2028-02-29', endDate: '2030-02-28' });
  });

  it('해지일 최대 = 오늘과 종료일 중 이른 날(D-15)', () => {
    expect(getMaxTerminationDate('2027-01-01', '2026-10-29')).toBe('2026-10-29');
    expect(getMaxTerminationDate('2026-10-01', '2026-10-29')).toBe('2026-10-01');
  });
});

describe('계약 경로', () => {
  it('갱신·호실 미리 선택을 주소에 남긴다', () => {
    expect(buildLocation('contractRegister', { renewFrom: 'c-1' })).toEqual({
      pathname: '/contracts/new',
      search: '?renewFrom=c-1',
    });
    expect(buildLocation('contractRegister', { propertyId: 'p-1' })).toEqual({
      pathname: '/contracts/new',
      search: '?propertyId=p-1',
    });
    expect(buildLocation('contractRegister')).toEqual({ pathname: '/contracts/new', search: '' });
  });

  it('사이드바 계약 메뉴는 계약 목록으로, /contracts/new는 상세보다 먼저 맞춘다', () => {
    expect(buildLocation('leases')).toEqual({ pathname: '/contracts' });
    expect(resolveViewKey('/contracts/new')).toBe('contractRegister');
    expect(resolveViewKey('/contracts/c-1')).toBe('contractDetail');
    expect(resolveViewKey('/contracts/c-1/edit')).toBe('contractEdit');
  });
});

describe('계약 날짜 범위', () => {
  it('날짜 칸 방향키로 넘어간 끝값(0001년, 275760년)은 범위 밖이다', () => {
    expect(isContractDateInRange('2027-11-01')).toBe(true);
    expect(isContractDateInRange('0001-11-01')).toBe(false);
    expect(isContractDateInRange('275760-11-01')).toBe(false);
    expect(isContractDateInRange('')).toBe(false);
  });

  it('폼 검증: 범위 밖 종료일은 범위 안내, 범위 안이면 시작일 비교', () => {
    const form = { ...EMPTY_CONTRACT_FORM, startDate: '2026-11-01' };
    expect(validateContractForm({ ...form, endDate: '275760-11-01' }).endDate).toBe('2000년부터 2099년 사이 날짜를 골라 주세요.');
    expect(validateContractForm({ ...form, endDate: '2025-11-01' }).endDate).toBe('종료일은 시작일보다 뒤여야 해요.');
    expect(validateContractForm({ ...form, endDate: '2027-10-31' }).endDate).toBeUndefined();
  });
});
