// OWNERSHIP 문서(내 소유 서류) 권한(docs/10. 유지보수 요청·문서 개발/서류함 개발 계획.md 3-3).
//   열람: 그 소유 관계의 본인(활성·종료 모두)만. 다른 임대인·임차인·ADMIN은 열람 불가(404).
//   올리기: 인증이 유효한 활성 소유 관계만(종료 422 OWNERSHIP_ENDED, 미인증·만료·철회 403 OWNERSHIP_VERIFICATION_REQUIRED).
//   삭제: 올린 본인이면 소유 종료·인증 만료 뒤에도 된다(lockForDelete는 종료·인증 상태를 보지 않는다).
//   권리자 인증 증빙(evidenceDocumentId로 연결된 문서)은 보이지 않는다.
import { AppError } from '../../platform/AppError.js';
import { getNow } from '../../platform/dateUtils.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { OWNERSHIP_DOCUMENT_TYPES } from './fileRules.js';

// 소유 관계 하나에 붙일 수 있는 문서 수
export const MAX_OWNERSHIP_ATTACHMENTS = 30;

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

// 소유 관계 행을 잠그고 내 것인지 확인한다. 없거나 남의 것이면 404.
const lockOwnOwnership = async (tx, user, ownershipId) => {
  const ownership = await lockOwnershipRow(tx, ownershipId);
  if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();
  return ownership;
};

export const ownershipDocumentPolicy = {
  canView: async (user, ownershipId) => {
    const ownership = await prisma.ownership.findUnique({ where: { id: ownershipId }, select: { userId: true } });
    return ownership?.userId === user.id;
  },
  // 인증 증빙 문서는 단건·목록에서도 숨긴다(서류함과 같은 결과).
  documentWhere: async () => ({ evidenceFor: { none: {} } }),
  lockForWrite: async (tx, user, ownershipId) => {
    const ownership = await lockOwnOwnership(tx, user, ownershipId);
    if (ownership.endedAt) throw new AppError('OWNERSHIP_ENDED', 422, '끝난 소유 관계라 서류를 올릴 수 없습니다.');
    if (computeOwnershipVerificationStatus(ownership, getNow()) !== 'VERIFIED') {
      throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증을 마친 호실만 내 소유 서류를 올릴 수 있습니다.');
    }
    return ownership;
  },
  // 지우기는 종료·인증 상태를 보지 않는다. 올린 본인인지는 deleteDocument(assertDocumentsDeletable)가 본다.
  lockForDelete: async (tx, user, ownershipId) => lockOwnOwnership(tx, user, ownershipId),
  throwNotFound: throwOwnershipNotFound,
  maxAttachments: MAX_OWNERSHIP_ATTACHMENTS,
  allowedDocumentTypes: OWNERSHIP_DOCUMENT_TYPES,
};
