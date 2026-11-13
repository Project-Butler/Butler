// 리소스에 붙은 문서(documents.resource_type + resource_id) 공용 함수. 관리 로그·소유 종료·문서 API가 함께 쓴다.
// 파일 삭제는 하지 않는다 — 행을 숨긴(deletedAt) 뒤 돌려준 저장 경로로 호출하는 쪽이 지운다(트랜잭션 밖에서).
import { AppError } from './AppError.js';

export const MANAGEMENT_LOG_RESOURCE = 'MANAGEMENT_LOG';
export const TICKET_RESOURCE = 'TICKET';
export const THREAD_MESSAGE_RESOURCE = 'THREAD_MESSAGE';
export const CONTRACT_RESOURCE = 'CONTRACT';

// 응답의 attachments 항목. 목록 응답에는 URL을 넣지 않는다(화면이 문서마다 다운로드 URL을 받는다).
export const toAttachmentResponse = (document) => ({
  id: document.id,
  fileName: document.fileName,
  mimeType: document.mimeType,
  sizeBytes: Number(document.sizeBytes),
  createdAt: document.createdAt.toISOString(),
  isLocked: document.isLocked,
});

const activeDocumentsWhere = (resourceType, resourceIds) => ({ resourceType, resourceId: { in: resourceIds }, deletedAt: null });

// 행마다 attachments(숨기지 않은 문서, 올린 순서)를 붙여 돌려준다.
export const withAttachments = async (client, resourceType, rows) => {
  if (rows.length === 0) return rows;
  const documents = await client.document.findMany({
    where: activeDocumentsWhere(resourceType, rows.map((row) => row.id)),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({ ...row, attachments: documents.filter((document) => document.resourceId === row.id) }));
};

export const findAttachedDocuments = (client, resourceType, resourceId) =>
  client.document.findMany({ where: activeDocumentsWhere(resourceType, [resourceId]), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

// 미연결 문서(내가 올렸고 아직 어디에도 안 붙음)만 붙인다. 남의 문서·이미 붙은 문서·지운 문서는 없는 문서로 본다(404).
export const attachDocumentsInTx = async (tx, user, { resourceType, resourceId, documentIds, now }) => {
  if (documentIds.length === 0) return;
  const { count } = await tx.document.updateMany({
    where: { id: { in: documentIds }, uploaderId: user.id, resourceType: null, deletedAt: null },
    data: { resourceType, resourceId, attachedAt: now },
  });
  if (count !== documentIds.length) {
    throw new AppError('DOCUMENT_NOT_FOUND', 404, '첨부할 문서를 찾을 수 없습니다.', [
      { field: 'attachmentDocumentIds', reason: '내가 올린 미연결 문서만 붙일 수 있습니다.' },
    ]);
  }
};

const throwNotDeletable = (message) => {
  throw new AppError('DOCUMENT_NOT_DELETABLE', 422, message);
};

// 문서를 숨기기 전 공통 확인: 잠긴 문서(넘어간 이력·인증 증빙)와 남이 올린 문서는 지울 수 없다.
export const assertDocumentsDeletable = (documents, user) => {
  if (documents.some((document) => document.isLocked)) throwNotDeletable('다음 소유자에게 넘어간 이력의 문서나 인증 증빙은 삭제할 수 없습니다.');
  if (documents.some((document) => document.uploaderId !== user.id)) throwNotDeletable('올린 사람만 문서를 삭제할 수 있습니다.');
};

// 숨김 처리하고 지울 파일의 저장 경로를 돌려준다.
// 읽은 뒤 다른 요청이 붙이거나(미연결 문서) 잠그거나 지웠으면 하나도 숨기지 않고 404로 트랜잭션을 되돌린다.
export const softDeleteDocumentsInTx = async (tx, documents, now) => {
  if (documents.length === 0) return [];
  const { count } = await tx.document.updateMany({
    where: {
      OR: documents.map((document) => ({ id: document.id, resourceType: document.resourceType, resourceId: document.resourceId })),
      isLocked: false,
      deletedAt: null,
    },
    data: { deletedAt: now },
  });
  if (count !== documents.length) throw new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.');
  return documents.map((document) => document.storagePath);
};

// 소유가 끝나 호실 이력이 다음 소유자에게 넘어갈 때, 그 기록들에 붙은 문서를 잠근다(계약 6장 DOCUMENT_NOT_DELETABLE).
export const lockHistoryLogDocumentsInTx = async (tx, ownershipId) => {
  const logs = await tx.propertyLog.findMany({ where: { ownershipId, scope: 'PROPERTY_HISTORY' }, select: { id: true } });
  if (logs.length === 0) return 0;
  const { count } = await tx.document.updateMany({
    where: activeDocumentsWhere(MANAGEMENT_LOG_RESOURCE, logs.map((log) => log.id)),
    data: { isLocked: true },
  });
  return count;
};
