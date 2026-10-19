// 호실·소유 관계 응답 직렬화 공용 함수(DB 의존 없음 — 단위 테스트 대상).
// 응답 모양은 api-contract.md 1장 PropertySummary, 3장 PropertyOwnership을 따른다.
import { toMoney } from './money.js';
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';
import { formatDisplayName } from './unitAddress.js';

const toIsoOrNull = (date) => (date ? date.toISOString() : null);

// Prisma Decimal(exclusiveArea) → JSON number. 값이 없으면 null을 유지한다.
const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

// property: Prisma Property + complex(include). api-contract.md 1장 PropertySummary.
export const toPropertySummary = (property) => ({
  id: property.id,
  complex: {
    id: property.complex.id,
    name: property.complex.name,
    legalDongCode: property.complex.legalDongCode,
  },
  buildingNo: property.buildingNo,
  unitNo: property.unitNo,
  displayName: formatDisplayName(property.complex.name, property.buildingNo, property.unitNo),
  exclusiveArea: toNumberOrNull(property.exclusiveArea),
  floor: property.floor ?? null,
});

// ownership: Prisma PropertyOwnership. verificationStatus는 저장값이 아니라 now 기준
// 계산값(EXPIRED 포함)을 내려준다(api-contract.md 3장 "소유 관계 상태 규칙").
export const toOwnershipResponse = (ownership, propertySummary, now = new Date()) => {
  if (!ownership) return null;

  return {
    id: ownership.id,
    property: propertySummary,
    userId: ownership.userId,
    acquiredYearMonth: ownership.acquiredYearMonth ?? null,
    purchasePrice: toMoney(ownership.purchasePrice) ?? null,
    verificationStatus: computeOwnershipVerificationStatus(ownership, now),
    verifiedAt: toIsoOrNull(ownership.verifiedAt),
    verificationExpiresAt: toIsoOrNull(ownership.verificationExpiresAt),
    startedAt: toIsoOrNull(ownership.startedAt),
    endedAt: toIsoOrNull(ownership.endedAt),
    endReason: ownership.endReason ?? null,
    isActive: !ownership.endedAt,
  };
};

const toContractIds = (contracts) => (contracts ?? []).map((contract) => contract.id);

// 요청자 기준 이 호실과의 관계(myRelation). 우선순위: OWNER(활성) > TENANT > FORMER_OWNER > ADMIN.
// - ownerships: 요청자의 이 호실 소유 관계 전부(종료 포함). contracts({ id })를 include하면 contractIds가 채워진다.
// - tenantContracts: 요청자가 임차인인 이 호실의 계약({ id }) 목록.
// 관계가 하나도 없으면 null — 호출하는 쪽이 404로 존재를 숨긴다.
export const resolveMyRelation = ({ role, ownerships = [], tenantContracts = [], now = new Date() }) => {
  const active = ownerships.find((ownership) => !ownership.endedAt);
  if (active) {
    return {
      type: 'OWNER',
      ownershipId: active.id,
      verificationStatus: computeOwnershipVerificationStatus(active, now),
      contractIds: toContractIds(active.contracts),
    };
  }

  if (tenantContracts.length > 0) {
    return { type: 'TENANT', ownershipId: null, verificationStatus: null, contractIds: toContractIds(tenantContracts) };
  }

  // 종료된 소유 관계가 여러 개면 가장 최근에 끝난 것을 쓴다.
  const latestEnded = ownerships
    .filter((ownership) => ownership.endedAt)
    .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())[0];
  if (latestEnded) {
    return {
      type: 'FORMER_OWNER',
      ownershipId: latestEnded.id,
      verificationStatus: computeOwnershipVerificationStatus(latestEnded, now),
      contractIds: toContractIds(latestEnded.contracts),
    };
  }

  if (role === 'ADMIN') {
    return { type: 'ADMIN', ownershipId: null, verificationStatus: null, contractIds: [] };
  }

  return null;
};
