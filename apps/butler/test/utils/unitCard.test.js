import { describe, expect, it } from 'vitest';
import { getLatestPastLog, getNeededAction, getNextEvent, groupByProperty, pickCardContract } from '../../src/landlord/web/utils/unitCard';

const today = '2026-11-08';
const now = new Date('2026-11-08T03:00:00Z');
const verified = { isActive: true, verificationStatus: 'VERIFIED', verificationExpiresAt: '2027-10-15T00:00:00Z' };

describe('pickCardContract', () => {
  it('진행 중 계약을 시작 전보다 먼저 고른다', () => {
    const upcoming = { id: 'u', status: 'UPCOMING' };
    const active = { id: 'a', status: 'ACTIVE' };
    expect(pickCardContract([upcoming, active])).toBe(active);
    expect(pickCardContract([upcoming])).toBe(upcoming);
    expect(pickCardContract([])).toBeNull();
  });
});

describe('groupByProperty', () => {
  it('propertyId별로 묶는다', () => {
    const map = groupByProperty([{ p: 'x' }, { p: 'y' }, { p: 'x' }], (item) => item.p);
    expect(map.get('x')).toHaveLength(2);
    expect(map.get('y')).toHaveLength(1);
  });
});

describe('getNextEvent', () => {
  it('오늘 이후 가장 가까운 일정 하나를 고른다(입금일·종료·인증 만료·예정 기록)', () => {
    const contract = { status: 'ACTIVE', nextRentPaymentDate: '2026-11-25', endDate: '2027-06-25' };
    const logs = [{ occurredOn: '2026-12-02', title: '보일러 점검', type: 'INSPECTION' }, { occurredOn: '2026-10-14', title: '지난 기록' }];
    expect(getNextEvent({ contract, ownership: verified, logs, today })).toEqual({ kind: 'RENT', date: '2026-11-25', label: '월세 입금일' });
    expect(getNextEvent({ contract: null, ownership: verified, logs, today })).toMatchObject({ kind: 'LOG', date: '2026-12-02', label: '보일러 점검' });
    expect(getNextEvent({ contract: null, ownership: verified, logs: [], today })).toMatchObject({ kind: 'VERIFICATION_EXPIRY', date: '2027-10-15' });
  });

  it('시작 전 계약은 시작일, 인증 전이면 인증 만료일을 넣지 않는다', () => {
    const contract = { status: 'UPCOMING', startDate: '2026-12-01', endDate: '2028-11-30' };
    expect(getNextEvent({ contract, ownership: { verificationStatus: 'UNVERIFIED' }, today })).toMatchObject({ kind: 'CONTRACT_START', date: '2026-12-01' });
  });

  it('일정이 없으면 null', () => {
    expect(getNextEvent({ contract: null, ownership: null, today })).toBeNull();
  });
});

describe('getNeededAction', () => {
  const property = { status: 'LEASED' };
  it('인증이 먼저: 미인증 VERIFY, 취소 INQUIRY, 만료 RENEW', () => {
    expect(getNeededAction({ property, contract: null, ownership: { isActive: true, verificationStatus: 'UNVERIFIED' }, now })).toBe('VERIFY');
    expect(getNeededAction({ property, contract: null, ownership: { isActive: true, verificationStatus: 'REVOKED' }, now })).toBe('INQUIRY');
    expect(getNeededAction({ property, contract: null, ownership: { isActive: true, verificationStatus: 'EXPIRED' }, now })).toBe('RENEW');
  });

  it('인증 완료 후: 공실이면 CONTRACT, 월세인데 입금일이 없으면 RENT_DAY, 아니면 null', () => {
    expect(getNeededAction({ property: { status: 'VACANT' }, contract: null, ownership: verified, now })).toBe('CONTRACT');
    expect(getNeededAction({ property, contract: { status: 'ACTIVE', leaseType: 'MONTHLY', rentPaymentDay: null }, ownership: verified, now })).toBe('RENT_DAY');
    expect(getNeededAction({ property, contract: { status: 'ACTIVE', leaseType: 'JEONSE', rentPaymentDay: null }, ownership: verified, now })).toBeNull();
    expect(getNeededAction({ property, contract: { status: 'ACTIVE', leaseType: 'MONTHLY', rentPaymentDay: 25 }, ownership: verified, now })).toBeNull();
  });
});

describe('getLatestPastLog', () => {
  it('오늘까지의 가장 최근 기록(날짜 내림차순 목록에서 첫 과거 기록)', () => {
    const logs = [{ occurredOn: '2026-12-02' }, { occurredOn: '2026-10-14', title: 'a' }, { occurredOn: '2026-09-03' }];
    expect(getLatestPastLog(logs, today)).toMatchObject({ title: 'a' });
    expect(getLatestPastLog([], today)).toBeNull();
  });
});
