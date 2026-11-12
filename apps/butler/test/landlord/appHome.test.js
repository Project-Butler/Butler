// M03 앱 홈의 숫자 계산. 웹 대시보드와 같은 API 응답에서 Figma 칸(총 보증금 · 계약 중 · 공실 · 권리자 인증 · 오늘 할 일)을 만든다.
// 실패 조건: 시작 전 계약이 보증금·계약 수에 섞임 · 공실을 API status 가 아닌 값으로 셈 · 인증 버튼이 인증된 호실로 감 · 불러오는 중에 0 을 보임.
import { describe, expect, it } from 'vitest';
import { toHomeSummary } from '../../src/landlord/app/utils/home';

const TODAY = '2026-11-07';

const contract = (overrides = {}) => ({
  id: 'c1',
  status: 'ACTIVE',
  deposit: 10000000,
  monthlyRent: 500000,
  endDate: '2027-12-31',
  daysUntilEnd: 419,
  nextRentPaymentDate: null,
  property: { id: 'p1', displayName: '101동 1001호' },
  ...overrides,
});
const property = (id, status) => ({ id, status });
const ownership = (propertyId, verificationStatus) => ({ id: `o-${propertyId}`, verificationStatus, property: { id: propertyId } });
const list = (items, total = items.length) => ({ items, meta: { total } });

describe('toHomeSummary: 계약', () => {
  it('보증금 합계와 계약 수는 진행 중(ACTIVE·EXPIRING_SOON)만 센다 — 시작 전(UPCOMING)은 뺀다', () => {
    const summary = toHomeSummary({
      contracts: list([
        contract({ id: 'a', deposit: 50000000 }),
        contract({ id: 'b', status: 'EXPIRING_SOON', deposit: 30000000, daysUntilEnd: 5 }),
        contract({ id: 'c', status: 'UPCOMING', deposit: 99000000 }),
      ]),
      today: TODAY,
    });
    expect(summary.depositSum).toBe(80000000);
    expect(summary.contractCount).toBe(2);
  });

  it('계약 중 칩: 종료 임박이 있으면 "종료 임박 N"(warning), 없으면 "정상"(success)', () => {
    expect(toHomeSummary({ contracts: list([contract()]), today: TODAY }).contractBadge).toEqual({ tone: 'success', label: '정상' });
    expect(
      toHomeSummary({ contracts: list([contract({ status: 'EXPIRING_SOON', daysUntilEnd: 5 }), contract({ id: 'x' })]), today: TODAY }).contractBadge,
    ).toEqual({ tone: 'warning', label: '종료 임박 1' });
  });

  it('오늘 할 일 = 오늘 월세 입금일 + 종료 임박(웹 대시보드와 같은 순서), 건수도 같다', () => {
    const summary = toHomeSummary({
      contracts: list([
        contract({ id: 'end', status: 'EXPIRING_SOON', daysUntilEnd: 5 }),
        contract({ id: 'rent', nextRentPaymentDate: TODAY }),
        contract({ id: 'later', nextRentPaymentDate: '2026-11-08' }),
      ]),
      today: TODAY,
    });
    expect(summary.tasks.map((task) => `${task.kind}:${task.contract.id}`)).toEqual(['rent:rent', 'expiring:end']);
    expect(summary.taskCount).toBe(2);
  });

  it('불러오는 중(contracts=null)이면 숫자는 null 이다(0 으로 보이지 않게)', () => {
    const summary = toHomeSummary({ today: TODAY });
    expect(summary).toMatchObject({ depositSum: null, contractCount: null, contractBadge: null, taskCount: null, tasks: [] });
  });
});

describe('toHomeSummary: 부동산·공실', () => {
  it('부동산 수는 meta.total, 공실은 API status 가 VACANT 인 호실만 센다(계약 예정 CONTRACT_PENDING 은 공실이 아니다)', () => {
    const summary = toHomeSummary({
      properties: list([property('p1', 'LEASED'), property('p2', 'VACANT'), property('p3', 'CONTRACT_PENDING'), property('p4', 'VACANT')]),
      today: TODAY,
    });
    expect(summary.propertyTotal).toBe(4);
    expect(summary.vacantCount).toBe(2);
  });

  it('불러오는 중이면 null', () => {
    expect(toHomeSummary({ today: TODAY })).toMatchObject({ propertyTotal: null, vacantCount: null });
  });
});

describe('toHomeSummary: 권리자 인증', () => {
  it('인증 수 / 전체, 미인증 수, 첫 미인증 호실(인증 버튼이 갈 곳)을 낸다', () => {
    const summary = toHomeSummary({
      ownerships: list([ownership('p1', 'VERIFIED'), ownership('p2', 'EXPIRED'), ownership('p3', 'UNVERIFIED')]),
      today: TODAY,
    });
    expect(summary.verification).toEqual({ verified: 1, total: 3, unverified: 2, firstUnverifiedPropertyId: 'p2' });
  });

  it('모두 인증됐으면 갈 곳이 없다(null)', () => {
    const summary = toHomeSummary({ ownerships: list([ownership('p1', 'VERIFIED')]), today: TODAY });
    expect(summary.verification.firstUnverifiedPropertyId).toBeNull();
    expect(summary.verification.unverified).toBe(0);
  });

  it('불러오는 중이면 verification 은 null', () => {
    expect(toHomeSummary({ today: TODAY }).verification).toBeNull();
  });
});
