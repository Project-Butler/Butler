// 홈 대시보드의 계약 일정·오늘 할 일 계산(명세 D-12). 화면 밖에서 테스트할 수 있게 순수 함수로 둔다.
import { addDays, formatManwon } from './contract';

// 예정 일정에 보여 줄 기간(D-12)
export const SCHEDULE_DAYS = 30;

// 예정 일정(D-12): 오늘~30일 안의 계약 시작일·종료일·다음 월세 입금일. 시작일은 시작 전 계약만.
// 월세 입금일은 서버가 계산한 nextRentPaymentDate 1개만 쓴다(#76 Q4). detail은 월세 금액('50만').
export const toScheduleEvents = (contracts, today) => {
  const last = addDays(today, SCHEDULE_DAYS);
  const inRange = (date) => Boolean(date) && date >= today && date <= last;
  return contracts
    .flatMap((contract) => [
      contract.status === 'UPCOMING' && inRange(contract.startDate)
        ? { key: `${contract.id}-start`, date: contract.startDate, title: '계약 시작', contract }
        : null,
      inRange(contract.endDate) ? { key: `${contract.id}-end`, date: contract.endDate, title: '계약 종료', contract } : null,
      inRange(contract.nextRentPaymentDate)
        ? {
            key: `${contract.id}-rent`,
            date: contract.nextRentPaymentDate,
            title: '월세 입금일',
            detail: formatManwon(contract.monthlyRent),
            contract,
          }
        : null,
    ])
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
};

// 오늘 할 일: 다음 입금일이 오늘인 계약만(당일에만, 미리 알려주기 없음 #76 Q4-1).
// contracts는 진행 중(ACTIVE·EXPIRING_SOON)이고 소유가 끝나지 않은 계약.
export const getRentDueToday = (contracts, today) =>
  contracts.filter((contract) => contract.nextRentPaymentDate === today);
