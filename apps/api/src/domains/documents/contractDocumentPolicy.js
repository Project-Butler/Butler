// CONTRACT 문서 권한(docs/11. 임차인 초대 개발/개발 계획.md 2-4, 결정 4).
//   열람: 임대인(그 계약의 활성·이전 소유자)은 전부, 연결된 임차인은 수락한 초대로 공유받은 문서만. ADMIN은 열람 불가(404).
//   올리기·삭제: 활성 소유자만, 읽기 전용 계약이면 422. 연결된 임차인은 403, 그 밖은 404.
import { AppError } from '../../platform/AppError.js';
import { isContractReadOnly } from '../../platform/contractRules.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { getTodayKST } from '../../platform/dateUtils.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';

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
  invitationShares: { some: { invitation: { contractId, status: 'ACCEPTED', acceptedBy: user.id } } },
});

export const contractDocumentPolicy = {
  canView: async (user, contractId) => Boolean(await resolveViewer(user, contractId)),
  documentWhere: async (user, contractId) => {
    const viewer = await resolveViewer(user, contractId);
    if (viewer === 'LANDLORD') return {};
    if (viewer === 'TENANT') return sharedWithTenantWhere(user, contractId);
    return { id: { in: [] } };
  },
  lockForWrite: async (tx, user, contractId) => {
    const found = await tx.contract.findUnique({ where: { id: contractId }, select: { ownershipId: true } });
    if (!found) throwContractNotFound();
    const ownership = await lockOwnershipRow(tx, found.ownershipId);
    // 잠근 뒤 다시 읽어 그 사이 바뀐 값(해지·임차인 연결)을 본다.
    const contract = await tx.contract.findUnique({ where: { id: contractId } });
    if (ownership.userId !== user.id) {
      if (contract.tenantId === user.id) throw new AppError('FORBIDDEN_ROLE', 403, '계약 문서는 임대인만 올리거나 지울 수 있습니다.');
      throwContractNotFound();
    }
    if (isContractReadOnly(computeContractStatus(contract, getTodayKST()), Boolean(ownership.endedAt))) {
      throw new AppError('CONTRACT_READ_ONLY', 422, '끝난 계약이라 문서를 올리거나 지울 수 없습니다.');
    }
    return contract;
  },
  throwNotFound: throwContractNotFound,
  maxAttachments: MAX_CONTRACT_ATTACHMENTS,
};
