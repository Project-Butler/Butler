// 계약 응답 직렬화(DB 의존 없음). 목록·상세·대시보드가 모두 이 함수를 쓴다(api-contract.md 4장).
import { isContractReadOnly } from './contractRules.js';
import { computeContractStatus, computeDaysUntilEnd } from './contractStatus.js';
import { toDateOnlyString } from './dateUtils.js';
import { toMoney } from './money.js';
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';
import { toPropertySummary } from './propertySerializer.js';
import { computeNextRentPaymentDate } from './rentPayment.js';

// 계약 조회 때 같이 읽을 관계. 응답을 만들려면 이 include가 있어야 한다.
export const CONTRACT_INCLUDE = {
  ownership: {
    include: {
      user: { select: { id: true, name: true, role: true } },
      property: { include: { complex: true } },
    },
  },
  tenant: { select: { id: true, name: true } },
  // 최신 초대 1건(응답의 tenant.invitationStatus 계산용)
  tenantInvitations: { orderBy: { createdAt: 'desc' }, take: 1 },
};

// 최신 초대 상태. PENDING인데 만료 시각이 지났으면 EXPIRED(R-14). 초대가 없으면 null.
const toInvitationStatus = (invitation, now) => {
  if (!invitation) return null;
  if (invitation.status === 'PENDING' && invitation.expiresAt <= now) return 'EXPIRED';
  return invitation.status;
};

// 요청자와 계약의 관계. 볼 수 없으면 null(호출하는 쪽이 404로 숨긴다).
export const resolveContractViewer = (contract, user) => {
  const { ownership } = contract;
  if (ownership.userId === user.id) return ownership.endedAt ? 'FORMER_OWNER' : 'OWNER';
  if (contract.tenantId === user.id) return 'TENANT';
  if (user.role === 'ADMIN') return 'ADMIN';
  return null;
};

// contract: Prisma Contract + CONTRACT_INCLUDE. viewer: resolveContractViewer 결과.
// 운영자에게 보이는 범위는 이 함수의 viewer === 'ADMIN' 결과로만 정한다. 지금은 메모만 가리며,
// 운영 시작 전 법률 검토 결과에 따라 줄이면 여기만 고친다.
export const toContractResponse = (contract, { viewer, todayKST, now = new Date() }) => {
  const { ownership } = contract;
  const status = computeContractStatus(contract, todayKST);
  const isOwner = viewer === 'OWNER';
  const ownershipEnded = Boolean(ownership.endedAt);

  return {
    id: contract.id,
    property: toPropertySummary(ownership.property),
    tenantName: contract.tenantName,
    leaseType: contract.leaseType,
    deposit: toMoney(contract.deposit),
    monthlyRent: toMoney(contract.monthlyRent),
    rentPaymentDay: contract.rentPaymentDay ?? null,
    // 오늘(KST) 이후 가장 가까운 입금일. status처럼 저장하지 않고 응답마다 계산한다(#76).
    nextRentPaymentDate: computeNextRentPaymentDate(contract, { todayKST, ownershipEnded }),
    startDate: toDateOnlyString(contract.startDate),
    endDate: toDateOnlyString(contract.endDate),
    status,
    daysUntilEnd: computeDaysUntilEnd(contract, todayKST, status),
    ownershipId: contract.ownershipId,
    landlord: ownership.user,
    // 끝난 소유 관계는 인증이 남아 있어도 false다.
    landlordVerified: !ownership.endedAt && computeOwnershipVerificationStatus(ownership, now) === 'VERIFIED',
    endReason: ownership.endReason ?? null,
    tenant: {
      name: contract.tenantName,
      phone: contract.tenantPhone,
      userId: contract.tenantId,
      invitationStatus: toInvitationStatus(contract.tenantInvitations?.[0], now),
      // 연결된 임차인 계정 이름은 소유자·이전 소유자에게만 보인다(임차인·운영자는 null).
      accountName: viewer === 'OWNER' || viewer === 'FORMER_OWNER' ? (contract.tenant?.name ?? null) : null,
    },
    terminatedOn: toDateOnlyString(contract.terminatedOn),
    terminationReason: contract.terminationReason ?? null,
    previousContractId: contract.previousContractId ?? null,
    // 메모는 임대인 개인 기록이라 소유자·이전 소유자에게만 보인다(임차인·운영자는 null, 명세 D-19).
    memo: viewer === 'OWNER' || viewer === 'FORMER_OWNER' ? (contract.memo ?? null) : null,
    isReadOnly: isOwner ? isContractReadOnly(status, ownershipEnded) : true,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
};
