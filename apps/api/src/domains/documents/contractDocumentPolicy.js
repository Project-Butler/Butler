// CONTRACT 문서 권한(docs/11. 임차인 초대 개발/개발 계획.md 2-4, 결정 4).
//   열람: 임대인(그 계약의 활성·이전 소유자)은 전부, 연결된 임차인은 수락한 초대로 공유받은 문서만. ADMIN은 열람 불가(404).
//   올리기: 그 계약의 소유 관계가 활성인 소유자만(계약 만료·해지·인증 만료와 무관). 소유가 끝났으면 422 CONTRACT_READ_ONLY.
//   삭제: 올리기와 같되, 만료·해지된 계약에서는 수락한 초대로 임차인에게 공유된 문서를 지울 수 없다(422 DOCUMENT_NOT_DELETABLE).
//   연결된 임차인의 올리기·삭제는 403, 그 밖은 404.
import { AppError } from '../../platform/AppError.js';
import { CONTRACT_RESOURCE } from '../../platform/documentAttachments.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { getTodayKST } from '../../platform/dateUtils.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';
import { CONTRACT_DOCUMENT_TYPES } from './fileRules.js';

// 계약 하나에 붙일 수 있는 문서 수(임대인만 올린다)
export const MAX_CONTRACT_ATTACHMENTS = 30;

const throwContractNotFound = () => {
  throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
};

// 요청자와 계약의 관계: 'LANDLORD'(활성·이전 소유자) / 'TENANT'(연결된 임차인) / null(볼 수 없음)
const resolveViewer = async (user, contractId) => {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { tenantId: true, ownership: { select: { userId: true } } },
  });
  if (!contract) return null;
  if (contract.ownership.userId === user.id) return 'LANDLORD';
  if (contract.tenantId === user.id) return 'TENANT';
  return null;
};

// 연결된 임차인이 볼 수 있는 문서: 그 계약의 수락한(본인이 수락한) 초대에 공유된 문서
export const sharedWithTenantWhere = (user, contractId) => ({
  invitationShares: { some: { invitation: { contractId, status: 'ACCEPTED', acceptedById: user.id } } },
});

// 쓰기 공통 잠금: 계약의 소유 관계를 잠그고 내 계약인지, 소유가 안 끝났는지 확인한다. 잠근 뒤 다시 읽은 계약을 돌려준다.
const lockOwnContract = async (tx, user, contractId) => {
  const found = await tx.contract.findUnique({ where: { id: contractId }, select: { ownershipId: true } });
  if (!found) throwContractNotFound();
  const ownership = await lockOwnershipRow(tx, found.ownershipId);
  // 잠근 뒤 다시 읽어 그 사이 바뀐 값(해지·임차인 연결)을 본다.
  const contract = await tx.contract.findUnique({ where: { id: contractId } });
  if (ownership.userId !== user.id) {
    if (contract.tenantId === user.id) throw new AppError('FORBIDDEN_ROLE', 403, '계약 문서는 임대인만 올리거나 지울 수 있습니다.');
    throwContractNotFound();
  }
  if (ownership.endedAt) throw new AppError('CONTRACT_READ_ONLY', 422, '소유가 끝난 계약이라 문서를 올리거나 지울 수 없습니다.');
  return contract;
};

export const contractDocumentPolicy = {
  canView: async (user, contractId) => Boolean(await resolveViewer(user, contractId)),
  documentWhere: async (user, contractId) => {
    const viewer = await resolveViewer(user, contractId);
    if (viewer === 'LANDLORD') return {};
    if (viewer === 'TENANT') return sharedWithTenantWhere(user, contractId);
    return { id: { in: [] } };
  },
  lockForWrite: lockOwnContract,
  lockForDelete: async (tx, user, contractId, document) => {
    const contract = await lockOwnContract(tx, user, contractId);
    if (!['EXPIRED', 'TERMINATED'].includes(computeContractStatus(contract, getTodayKST()))) return contract;
    // 공유 여부는 문서 단위라 리소스 잠금만으로는 알 수 없다. 수락한 초대로 공유된 문서만 막는다.
    const sharedCount = await tx.tenantInvitationDocument.count({
      where: { documentId: document.id, invitation: { contractId, status: 'ACCEPTED' } },
    });
    if (sharedCount > 0) throw new AppError('DOCUMENT_NOT_DELETABLE', 422, '임차인에게 공유한 문서는 계약이 끝난 뒤 지울 수 없습니다.');
    return contract;
  },
  // 서류함·목록 수용 배치 where. 임대인으로서 볼 수 있는 계약(내 소유 관계의 계약)만 남긴다. 단건 documentWhere의 LANDLORD 값({})과 같다.
  landlordScopeWhere: async (user, contractIds) => {
    const owned = await prisma.contract.findMany({ where: { id: { in: contractIds }, ownership: { userId: user.id } }, select: { id: true } });
    return { resourceType: CONTRACT_RESOURCE, resourceId: { in: owned.map((contract) => contract.id) } };
  },
  throwNotFound: throwContractNotFound,
  maxAttachments: MAX_CONTRACT_ATTACHMENTS,
  allowedDocumentTypes: CONTRACT_DOCUMENT_TYPES,
};
