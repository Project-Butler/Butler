import { daysBetween, getTodayKST } from '../../shared/contractFormat';

// 임차인 홈 계약 카드 순서: 진행 중 → 만료 임박 → 시작 전 → 끝난 계약. 같은 묶음은 끝나는 날이 가까운 순.
const STATUS_ORDER = { EXPIRING_SOON: 0, ACTIVE: 0, UPCOMING: 1, EXPIRED: 2, TERMINATED: 2 };

export const sortTenantContracts = (contracts = []) =>
  [...contracts].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || String(a.endDate).localeCompare(String(b.endDate)));

// 다음 월세 날짜까지 남은 날. 서버가 계산한 nextRentPaymentDate 가 없으면 null(전세·입금일 없음·끝난 계약).
export const getNextRentDays = (contract, today = getTodayKST()) =>
  contract?.nextRentPaymentDate ? daysBetween(today, contract.nextRentPaymentDate) : null;

// 계약 응답(GET /contracts/:id) → 계약 조건 카드(shared/ContractTerms) 값
export const toContractTerms = (contract) => ({
  propertyDisplayName: contract.property?.displayName ?? '',
  leaseType: contract.leaseType,
  deposit: contract.deposit,
  monthlyRent: contract.monthlyRent,
  rentPaymentDay: contract.rentPaymentDay ?? null,
  startDate: contract.startDate,
  endDate: contract.endDate,
  landlordName: contract.landlord?.name ?? null,
});
