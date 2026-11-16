// 초대 공유 문서 목록·다운로드 주소 발급. 한 건 조회는 documents/service.js의 findSharedInvitationDocument를 쓴다.
// 목록 조회와, summary에 invitationId를 남기는 다운로드 주소 발급(계약 4장 V-03)은 documents에 공용 함수가 없어 여기 둔다.
// documents의 createDocumentDownloadUrl이 summary를 받게 되면 그쪽으로 옮긴다.
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow } from '../../platform/dateUtils.js';
import { AUDITED_DOWNLOAD_TYPES } from '../documents/fileRules.js';
import { selectStorage } from '../documents/storage/index.js';

export const INVITATION_DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;

const SHARED_DOCUMENT_SELECT = { id: true, type: true, fileName: true, mimeType: true, sizeBytes: true, storagePath: true };

// 그 초대가 공유한 문서 중 숨기지 않았고 같은 계약에 붙은 것만.
const sharedDocumentWhere = (invitation) => ({
  deletedAt: null,
  resourceType: 'CONTRACT',
  resourceId: invitation.contractId,
  invitationShares: { some: { invitationId: invitation.id } },
});

export const findSharedInvitationDocuments = (client, invitation) =>
  client.document.findMany({ where: sharedDocumentWhere(invitation), select: SHARED_DOCUMENT_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

export const toSharedDocumentResponse = (document) => ({
  id: document.id,
  fileName: document.fileName,
  mimeType: document.mimeType,
  sizeBytes: Number(document.sizeBytes),
});

// 5분 서명 주소. 계약서·등기부는 actor 없이(로그인 전 열람) invitationId를 summary에 남긴다.
export const issueSharedDocumentDownloadUrl = async (client, { invitation, document, req }) => {
  const storage = selectStorage();
  if (!storage) throw new AppError('STORAGE_UNAVAILABLE', 503, '사진·문서 첨부를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
  const expiresAt = new Date(getNow().getTime() + INVITATION_DOWNLOAD_URL_TTL_MS);
  // Supabase 드라이버는 비동기라 기다린다(local은 바로 값을 준다).
  const url = await storage.createDownloadUrl({ documentId: document.id, storagePath: document.storagePath, fileName: document.fileName, expiresAt });
  if (AUDITED_DOWNLOAD_TYPES.includes(document.type)) {
    await audit.record({
      actor: null,
      action: 'DOCUMENT_DOWNLOAD_URL_ISSUED',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      summary: `초대 확인 열람(invitationId=${invitation.id}) ${document.type} 다운로드 URL 발급`,
      req,
      client,
    });
  }
  return { url, expiresAt: expiresAt.toISOString() };
};
