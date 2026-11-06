import { describe, expect, it } from 'vitest';
import { getRentDueToday, toScheduleEvents } from '../../src/utils/dashboard';

const TODAY = '2026-11-04';

const contract = (overrides = {}) => ({
  id: 'c1',
  status: 'ACTIVE',
  leaseType: 'MONTHLY',
  monthlyRent: 500000,
  startDate: '2026-01-01',
  endDate: '2027-12-31',
  nextRentPaymentDate: null,
  property: { displayName: '101동 1001호' },
  ...overrides,
});

describe('홈 예정 일정(D-12, #76)', () => {
  it('다음 월세 입금일이 30일 안이면 월세 금액과 함께 넣는다', () => {
    const events = toScheduleEvents([contract({ nextRentPaymentDate: '2026-11-25' })], TODAY);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: 'c1-rent', date: '2026-11-25', title: '월세 입금일', detail: '50만' });
  });

  it('30일 밖이거나 값이 없으면 넣지 않는다, 오늘과 30일째는 넣는다', () => {
    expect(toScheduleEvents([contract({ nextRentPaymentDate: '2026-12-05' })], TODAY)).toHaveLength(0);
    expect(toScheduleEvents([contract()], TODAY)).toHaveLength(0);
    expect(toScheduleEvents([contract({ nextRentPaymentDate: TODAY })], TODAY)).toHaveLength(1);
    expect(toScheduleEvents([contract({ nextRentPaymentDate: '2026-12-04' })], TODAY)).toHaveLength(1);
  });

  it('계약 시작·종료와 섞여 날짜순', () => {
    const events = toScheduleEvents(
      [
        contract({ id: 'a', endDate: '2026-11-20', nextRentPaymentDate: '2026-11-10' }),
        contract({ id: 'b', status: 'UPCOMING', startDate: '2026-11-05', endDate: '2028-11-04' }),
      ],
      TODAY,
    );
    expect(events.map((event) => event.key)).toEqual(['b-start', 'a-rent', 'a-end']);
  });
});

describe('홈 오늘 할 일: 월세 입금일(#76 Q4-1)', () => {
  const due = contract({ nextRentPaymentDate: TODAY });

  it('입금일 당일에만 나온다', () => {
    expect(getRentDueToday([due], TODAY)).toEqual([due]);
  });

  it('전날·다음 날에는 나오지 않는다', () => {
    // 전날: 다음 입금일이 내일
    expect(getRentDueToday([contract({ nextRentPaymentDate: '2026-11-05' })], TODAY)).toEqual([]);
    // 다음 날: 서버가 다음 달 입금일로 넘긴다
    expect(getRentDueToday([contract({ nextRentPaymentDate: '2026-12-04' })], '2026-11-05')).toEqual([]);
    expect(getRentDueToday([contract()], TODAY)).toEqual([]);
  });
});
