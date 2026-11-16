// 서류함(임대인의 내 소유 서류 + 계약 서류 모음). 권한은 두 정책의 landlordScopeWhere만 조합한다.
// docs/10. 유지보수 요청·문서 개발/서류함 개발 계획.md 3-5·3-6.
import { getNow, getTodayKST, toDateOnlyString } from '../../platform/dateUtils.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { toPropertySummary } from '../../platform/propertySerializer.js';
import { contractDocumentPolicy } from './contractDocumentPolicy.js';
import { ownershipDocumentPolicy } from './ownershipDocumentPolicy.js';
import { toDocumentResponse } from './service.js';

const IN_PROGRESS_STATUSES = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON'];

// 서류함에 들어갈 문서의 where: 숨기지 않았고 증빙이 아니며, 내 소유 관계·내 계약에 붙은 것.
export const documentBoxWhere = async (user, { ownershipIds, contractIds }) => ({
  deletedAt: null,
  evidenceFor: { none: {} },
  OR: await Promise.all([
    ownershipDocumentPolicy.landlordScopeWhere(user, ownershipIds),
    contractDocumentPolicy.landlordScopeWhere(user, contractIds),
  ]),
});

// ownerships: [{ id, propertyId, contracts: [{ id }] }] (내 소유 관계, 종료 포함). 호실별 서류함 문서 수 Map(propertyId → 수).
export const countDocumentBoxDocuments = async (user, ownerships) => {
  const propertyByResource = new Map();
  for (const ownership of ownerships) {
    propertyByResource.set(ownership.id, ownership.propertyId);
    for (const contract of ownership.contracts) propertyByResource.set(contract.id, ownership.propertyId);
  }
  const where = await documentBoxWhere(user, {
    ownershipIds: ownerships.map((ownership) => ownership.id),
    contractIds: ownerships.flatMap((ownership) => ownership.contracts.map((contract) => contract.id)),
  });
  const groups = await prisma.document.groupBy({ by: ['resourceType', 'resourceId'], where, _count: { _all: true } });
  const counts = new Map();
  for (const group of groups) {
    const propertyId = propertyByResource.get(group.resourceId);
    counts.set(propertyId, (counts.get(propertyId) ?? 0) + group._count._all);
  }
  return counts;
};

const endedDate = (contract) => (contract.status === 'TERMINATED' && contract.terminatedOn ? contract.terminatedOn : contract.endDate);

// 시작 전·진행 중·만료 임박 먼저 시작일 최근 순, 그다음 만료·해지 종료일(해지면 해지일) 최근 순.
// contract: { id, status, startDate, endDate, terminatedOn }(날짜는 YYYY-MM-DD 문자열)
export const sortDocumentBoxContracts = (contracts) => {
  const inProgress = (contract) => IN_PROGRESS_STATUSES.includes(contract.status);
  const byDateDesc = (a, b, dateOf) => (dateOf(a) < dateOf(b) ? 1 : dateOf(a) > dateOf(b) ? -1 : a.id.localeCompare(b.id));
  return [...contracts].sort((a, b) => {
    if (inProgress(a) !== inProgress(b)) return inProgress(a) ? -1 : 1;
    return byDateDesc(a, b, inProgress(a) ? (contract) => contract.startDate : endedDate);
  });
};

const toDateOrNull = (value) => (value ? toDateOnlyString(value) : null);

// GET /properties/:propertyId/documents. 그 호실에 내 소유 관계(진행·종료)가 없으면 null(→ 404).
export const findPropertyDocumentBox = async (user, propertyId) => {
  // 필요한 칸만 읽는다(tenantPhone·deposit·monthlyRent는 읽지 않는다).
  const ownerships = await prisma.ownership.findMany({
    where: { propertyId, userId: user.id },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      verificationStatus: true,
      verificationExpiresAt: true,
      property: { include: { complex: true } },
      contracts: { select: { id: true, ownershipId: true, tenantName: true, startDate: true, endDate: true, terminatedOn: true } },
    },
  });
  if (ownerships.length === 0) return null;

  const contracts = ownerships.flatMap((ownership) => ownership.contracts);
  const documents = await prisma.document.findMany({
    where: await documentBoxWhere(user, { ownershipIds: ownerships.map((ownership) => ownership.id), contractIds: contracts.map((contract) => contract.id) }),
    include: { invitationShares: { where: { invitation: { status: 'ACCEPTED' } }, select: { invitation: { select: { contractId: true } } } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  const now = getNow();
  const today = getTodayKST();
  const activeOwnershipIds = new Set(ownerships.filter((ownership) => !ownership.endedAt).map((ownership) => ownership.id));

  const ownershipItems = [...ownerships]
    .sort((a, b) => {
      if (Boolean(a.endedAt) !== Boolean(b.endedAt)) return a.endedAt ? 1 : -1;
      return (b.endedAt ?? b.startedAt).getTime() - (a.endedAt ?? a.startedAt).getTime();
    })
    .map((ownership) => {
      const verificationStatus = computeOwnershipVerificationStatus(ownership, now);
      return {
        id: ownership.id,
        isActive: !ownership.endedAt,
        startedAt: ownership.startedAt.toISOString(),
        endedAt: ownership.endedAt?.toISOString() ?? null,
        verificationStatus,
        isUploadable: !ownership.endedAt && verificationStatus === 'VERIFIED',
        documents: documents.filter((document) => document.resourceType === 'OWNERSHIP' && document.resourceId === ownership.id).map(toDocumentResponse),
      };
    });

  const contractItems = sortDocumentBoxContracts(
    contracts.map((contract) => ({
      id: contract.id,
      ownershipId: contract.ownershipId,
      tenantName: contract.tenantName,
      startDate: toDateOnlyString(contract.startDate),
      endDate: toDateOnlyString(contract.endDate),
      terminatedOn: toDateOrNull(contract.terminatedOn),
      status: computeContractStatus(contract, today),
    })),
  ).map((contract) => ({
    id: contract.id,
    ownershipId: contract.ownershipId,
    tenantName: contract.tenantName,
    startDate: contract.startDate,
    endDate: contract.endDate,
    status: contract.status,
    isUploadable: activeOwnershipIds.has(contract.ownershipId),
    documents: documents
      .filter((document) => document.resourceType === 'CONTRACT' && document.resourceId === contract.id)
      // 삭제 검사(contractDocumentPolicy.lockForDelete)와 같게 그 계약의 수락한 초대만 센다.
      .map((document) => ({
        ...toDocumentResponse(document),
        isSharedWithTenant: document.invitationShares.some((share) => share.invitation.contractId === contract.id),
      })),
  }));

  return {
    property: toPropertySummary(ownerships[0].property),
    documentCount: documents.length,
    ownerships: ownershipItems,
    contracts: contractItems,
  };
};
