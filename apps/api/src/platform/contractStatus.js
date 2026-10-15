// Contract.status는 DB에 저장하지 않는다 — 응답을 만들 때마다 이 파일로 계산한다.
// (api-contract.md 4장 "구현 참고 — status는 저장하지 않는다")
import { compareDateStrings, daysBetween, toDateOnlyString } from './dateUtils.js';

export const CONTRACT_EXPIRING_SOON_DAYS = 120;

// contract: { startDate, endDate, terminatedOn } (Prisma Contract 또는 같은 모양).
// startDate/endDate/terminatedOn은 Prisma @db.Date 컬럼(JS Date)을 그대로 받는다.
export const computeContractStatus = (contract, todayKST) => {
  if (contract.terminatedOn) return 'TERMINATED';

  const startDate = toDateOnlyString(contract.startDate);
  const endDate = toDateOnlyString(contract.endDate);

  if (compareDateStrings(todayKST, startDate) < 0) return 'UPCOMING';
  if (compareDateStrings(todayKST, endDate) > 0) return 'EXPIRED';

  const daysUntilEnd = daysBetween(todayKST, endDate);
  return daysUntilEnd <= CONTRACT_EXPIRING_SOON_DAYS ? 'EXPIRING_SOON' : 'ACTIVE';
};

// 응답의 daysUntilEnd 필드. UPCOMING·ACTIVE·EXPIRING_SOON일 때만 값이 있고,
// TERMINATED·EXPIRED는 null이다(api-contract.md 4장 비교 메모 참고).
export const computeDaysUntilEnd = (contract, todayKST, status) => {
  if (status === 'TERMINATED' || status === 'EXPIRED') return null;
  return daysBetween(todayKST, toDateOnlyString(contract.endDate));
};
