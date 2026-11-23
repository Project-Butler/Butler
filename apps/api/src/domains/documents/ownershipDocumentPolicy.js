// OWNERSHIP 문서(내 소유 서류) 권한(docs/10. 유지보수 요청·문서 개발/서류함 개발 계획.md 3-3).
//   열람: 그 소유 관계의 본인(활성·종료 모두)만. 다른 임대인·임차인·ADMIN은 열람 불가(404).
//   올리기·삭제: 내 소유 관계(활성·종료 모두)면 소유 종료·권리자 인증과 관계없이 된다(2026-11-20 문서함 제한 제거). 삭제는 올린 본인만.
//   권리자 인증 증빙(evidenceDocumentId로 연결된 문서)은 보이지 않는다.
import { AppError } from '../../platform/AppError.js';
import { OWNERSHIP_RESOURCE } from '../../platform/documentAttachments.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
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

// 인증 증빙 문서는 단건·목록·서류함 모두에서 숨긴다.
const documentWhere = async () => ({ evidenceFor: { none: {} } });

export const ownershipDocumentPolicy = {
  canView: async (user, ownershipId) => {
    const ownership = await prisma.ownership.findUnique({ where: { id: ownershipId }, select: { userId: true } });
    return ownership?.userId === user.id;
  },
  documentWhere,
  // 올리기·지우기 모두 내 소유 관계인지만 본다. 올린 본인인지는 deleteDocument(assertDocumentsDeletable)가 본다.
  lockForWrite: lockOwnOwnership,
  // 서류함·목록 수용 배치 where. 넘겨받은 id를 믿지 않고 내 소유 관계로 다시 거른다.
  // 목록에서 지운 소유 관계(H-41)의 서류는 지우지 않고 서류함·검색에서만 뺀다.
  landlordScopeWhere: async (user, ownershipIds) => {
    const owned = await prisma.ownership.findMany({ where: { id: { in: ownershipIds }, userId: user.id, removedAt: null }, select: { id: true } });
    return { resourceType: OWNERSHIP_RESOURCE, resourceId: { in: owned.map((ownership) => ownership.id) }, ...(await documentWhere()) };
  },
  throwNotFound: throwOwnershipNotFound,
  maxAttachments: MAX_OWNERSHIP_ATTACHMENTS,
  allowedDocumentTypes: OWNERSHIP_DOCUMENT_TYPES,
};
