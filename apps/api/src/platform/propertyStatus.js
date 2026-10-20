// 호실 운영 상태(명세 변경 C7). 저장하지 않고 응답마다 "내" 계약으로 계산한다(DB 의존 없음).
// - LEASED: 진행 중 계약(ACTIVE·EXPIRING_SOON)이 있음
// - CONTRACT_PENDING: 진행 중 계약은 없고 시작 전 계약(UPCOMING)이 있음
// - VACANT: 그 밖(계약 없음, 해지·만료만 있음)
// "계약대기"의 정확한 조건은 계약(#4) 담당과 확정한다(계획 Q2) — 바뀌면 이 함수만 고친다.
import { computeContractStatus } from './contractStatus.js';

export const PROPERTY_STATUSES = Object.freeze(['VACANT', 'CONTRACT_PENDING', 'LEASED']);

// contracts: [{ startDate, endDate, terminatedOn }] (Prisma Contract 일부)
export const computePropertyStatus = (contracts, todayKST) => {
  const statuses = (contracts ?? []).map((contract) => computeContractStatus(contract, todayKST));
  if (statuses.some((status) => status === 'ACTIVE' || status === 'EXPIRING_SOON')) return 'LEASED';
  if (statuses.includes('UPCOMING')) return 'CONTRACT_PENDING';
  return 'VACANT';
};
