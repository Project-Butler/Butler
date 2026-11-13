// 파일·문서(계약 6장). 업로드 순서: 업로드 세션 → uploadUrl로 PUT → POST /documents 등록.
// 저장소는 storage/index.js가 고른다(임시 로컬 저장소 또는 Supabase Storage). 못 쓰면 503 STORAGE_UNAVAILABLE.
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow } from '../../platform/dateUtils.js';
import { assertDocumentsDeletable, CONTRACT_RESOURCE, softDeleteDocumentsInTx } from '../../platform/documentAttachments.js';
import { prisma } from '../../platform/prismaClient.js';
import { AUDITED_DOWNLOAD_TYPES, MAX_FILE_BYTES, matchesDeclaredType, toStoragePath } from './fileRules.js';
import { getResourcePolicy, visibleDocumentWhere } from './resourcePolicies.js';
import { removeStoredObjects, selectStorage } from './storage/index.js';

// 결정 Q2: 업로드 15분, 다운로드 5분
export const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;
// 미연결 문서는 24시간 안에 안 붙으면 정리한다(계약 6장)
export const UNATTACHED_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;
// 만료된 업로드 세션은 2시간 더 두고 지운다. 만료 직전에 시작한 업로드·등록이 끝날 여유이고,
// Supabase 서명 업로드 URL은 발급 뒤 2시간 유효(바꿀 수 없음)라 그 안에 늦게 올라온 파일도 행과 함께 지우기 위해서다.
export const UPLOAD_CLEANUP_GRACE_MS = 2 * 60 * 60 * 1000;
const CLEANUP_BATCH = 200;

export const requireStorage = () => {
  const storage = selectStorage();
  if (!storage) throw new AppError('STORAGE_UNAVAILABLE', 503, '사진·문서 첨부를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
  return storage;
};

const throwDocumentNotFound = () => {
  throw new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.');
};

const throwUploadSessionNotFound = () => {
  throw new AppError('UPLOAD_SESSION_NOT_FOUND', 404, '업로드 세션을 찾을 수 없습니다.');
};

const throwUploadSessionExpired = () => {
  throw new AppError('UPLOAD_SESSION_EXPIRED', 422, '업로드 시간이 지났습니다. 다시 올려 주세요.');
};

const throwSignatureInvalid = () => {
  throw new AppError('STORAGE_SIGNATURE_INVALID', 403, '주소가 올바르지 않거나 만료되었습니다.');
};

export const toDocumentResponse = (document) => ({
  id: document.id,
  documentType: document.type,
  fileName: document.fileName,
  mimeType: document.mimeType,
  sizeBytes: Number(document.sizeBytes),
  resourceType: document.resourceType ?? null,
  resourceId: document.resourceId ?? null,
  isLocked: document.isLocked,
  uploaderId: document.uploaderId,
  createdAt: document.createdAt.toISOString(),
});

// POST /files/upload-sessions
export const createUploadSession = async (user, { fileName, mimeType, sizeBytes, documentType }) => {
  const storage = requireStorage();
  const id = randomUUID();
  const expiresAt = new Date(getNow().getTime() + UPLOAD_SESSION_TTL_MS);
  await prisma.upload.create({
    data: { id, userId: user.id, fileName, mimeType, sizeBytes: BigInt(sizeBytes), type: documentType, storagePath: toStoragePath(id), expiresAt },
  });
  const target = await storage.createUploadTarget({ uploadId: id, mimeType, expiresAt });
  return { id, ...target, expiresAt: expiresAt.toISOString() };
};

// 업로드 본문 서명 확인. 본문(최대 20MB)을 읽기 전에 라우터가 먼저 부르고(controller.checkUploadContent), 받은 뒤에도 다시 본다.
export const verifyUploadRequest = (uploadId, token, now) => {
  const storage = requireStorage();
  if (!storage.servesContent) throwUploadSessionNotFound();
  const tokenState = storage.verifyUploadToken({ uploadId, token, now });
  if (tokenState === 'invalid') throwSignatureInvalid();
  if (tokenState === 'expired') throwUploadSessionExpired();
  return storage;
};

// PUT /files/upload-sessions/:id/content — 임시 로컬 저장소 전용. 쿠키 대신 서명으로 판단한다.
export const receiveUploadContent = async (uploadId, token, body) => {
  const now = getNow();
  const storage = verifyUploadRequest(uploadId, token, now);

  const upload = await prisma.upload.findUnique({ where: { id: uploadId }, include: { document: { select: { id: true } } } });
  // 이미 등록한 업로드는 다시 쓰지 않는다.
  if (!upload || upload.document) throwUploadSessionNotFound();
  if (upload.expiresAt <= now) throwUploadSessionExpired();

  const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
  if (content.length > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE', 422, '파일은 20MB까지 올릴 수 있습니다.');
  if (content.length !== Number(upload.sizeBytes)) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
      { field: 'body', reason: `업로드 세션의 크기(${upload.sizeBytes}바이트)와 다릅니다.` },
    ]);
  }
  if (!matchesDeclaredType(content, upload.mimeType)) {
    throw new AppError('FILE_TYPE_NOT_ALLOWED', 422, '파일 내용이 선택한 형식과 다릅니다.');
  }

  await storage.writeObject(upload.storagePath, content);
  await prisma.upload.update({ where: { id: upload.id }, data: { completedAt: now } });
};

// 업로드가 끝났는지. 저장소가 직접 받는 경우(외부 Storage)는 completedAt이 없으므로 파일을 확인해 채운다.
const ensureUploadCompleted = async (storage, upload, now) => {
  if (upload.completedAt) return;
  const confirmed = await storage.confirmObject(upload);
  if (!confirmed) throw new AppError('UPLOAD_NOT_COMPLETED', 422, '파일 업로드가 끝나지 않았습니다.');
  await prisma.upload.update({ where: { id: upload.id }, data: { completedAt: now } });
};

// 리소스에 붙이기 전 확인: 리소스를 잠그고(수정 가능해야 함) 상한을 넘지 않는지 본다.
const lockResourceForAttach = async (tx, user, policy, resourceId, addCount) => {
  await policy.lockForWrite(tx, user, resourceId);
  const attached = await tx.document.count({ where: { resourceType: policy.resourceType, resourceId, deletedAt: null } });
  if (attached + addCount > policy.maxAttachments) {
    throw new AppError('ATTACHMENT_LIMIT_EXCEEDED', 422, `문서는 ${policy.maxAttachments}개까지 붙일 수 있습니다.`);
  }
};

// POST /documents — resourceType·resourceId를 빼면 미연결 문서(올린 사람만 보고 24시간 안에 안 붙으면 정리).
export const registerDocument = async (user, { uploadSessionId, resourceType, resourceId }) => {
  const storage = requireStorage();
  const now = getNow();
  const upload = await prisma.upload.findUnique({ where: { id: uploadSessionId }, include: { document: { select: { id: true } } } });
  if (!upload || upload.userId !== user.id || upload.document) throwUploadSessionNotFound();
  if (upload.expiresAt <= now) throwUploadSessionExpired();
  await ensureUploadCompleted(storage, upload, now);

  const policy = resourceType ? { ...getResourcePolicy(resourceType), resourceType } : null;
  const document = await prisma.$transaction(async (tx) => {
    if (policy) await lockResourceForAttach(tx, user, policy, resourceId, 1);
    return tx.document.create({
      data: {
        uploadId: upload.id,
        uploaderId: user.id,
        type: upload.type,
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        attachedAt: policy ? now : null,
      },
    });
  }).catch((error) => {
    // 같은 업로드를 동시에 두 번 등록하면 뒤 요청은 uploadId 유니크에 걸린다. 이미 등록한 업로드와 같게 404.
    if (error?.code === 'P2002') throwUploadSessionNotFound();
    throw error;
  });
  return toDocumentResponse(document);
};

// 문서를 볼 수 있는지. 미연결 문서는 올린 사람만, 붙은 문서는 그 리소스를 볼 수 있고 정책의 documentWhere에 드는 것만.
const canViewDocument = async (user, document) => {
  if (!document.resourceType) return document.uploaderId === user.id;
  const policy = getResourcePolicy(document.resourceType);
  if (!policy) return document.uploaderId === user.id;
  if (!(await policy.canView(user, document.resourceId))) return false;
  const visibleWhere = await visibleDocumentWhere(policy, user, document.resourceId);
  if (Object.keys(visibleWhere).length === 0) return true;
  return (await prisma.document.count({ where: { AND: [{ id: document.id }, visibleWhere] } })) > 0;
};

const findVisibleDocument = async (user, documentId) => {
  const document = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
  if (!document || !(await canViewDocument(user, document))) throwDocumentNotFound();
  return document;
};

// GET /documents?resourceType&resourceId — 리소스를 볼 수 없으면 그 리소스의 404.
export const findResourceDocuments = async (user, { resourceType, resourceId, page, size }) => {
  const policy = getResourcePolicy(resourceType);
  if (!(await policy.canView(user, resourceId))) policy.throwNotFound();
  const where = { AND: [{ resourceType, resourceId, deletedAt: null }, await visibleDocumentWhere(policy, user, resourceId)] };
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * size, take: size }),
  ]);
  return { items: rows.map(toDocumentResponse), meta: { page, size, total, hasNext: page * size < total } };
};

// GET /documents/:documentId
export const findDocumentForUser = async (user, documentId) => toDocumentResponse(await findVisibleDocument(user, documentId));

// 권한 확인을 마친 문서(Prisma Document 행)의 5분짜리 다운로드 URL. 계약서·등기부는 감사 로그에 남긴다.
// actor: 요청자({ id, role }) 또는 null(로그인 없는 초대 열람 등 → 감사 로그 actorType SYSTEM). req는 requestId·ip용(선택).
// 돌려주는 값: { url, expiresAt(ISO 문자열) }. 저장소를 못 쓰면 503 STORAGE_UNAVAILABLE.
export const createDocumentDownloadUrl = async (document, { actor = null, req } = {}) => {
  const storage = requireStorage();
  const expiresAt = new Date(getNow().getTime() + DOWNLOAD_URL_TTL_MS);
  const url = await storage.createDownloadUrl({ documentId: document.id, storagePath: document.storagePath, fileName: document.fileName, expiresAt });
  if (AUDITED_DOWNLOAD_TYPES.includes(document.type)) {
    await audit.record({
      actor,
      action: 'DOCUMENT_DOWNLOAD_URL_ISSUED',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      summary: `${document.type} 다운로드 URL 발급`,
      req,
    });
  }
  return { url, expiresAt: expiresAt.toISOString() };
};

// POST /documents/:documentId/download-url — 5분 유효.
export const issueDownloadUrl = async (user, documentId, req) =>
  createDocumentDownloadUrl(await findVisibleDocument(user, documentId), { actor: user, req });

// 초대 화면(로그인 전 본인 확인 뒤)에서 쓰는 조회: 그 초대에 공유됐고, 숨기지 않았고, 그 계약에 붙은 문서만 돌려준다(없으면 null).
// 사용자 권한은 보지 않는다 — 초대·확인 세션 검사는 부르는 쪽(tenantInvitations)이 먼저 한다.
// 다운로드 URL이 필요하면 돌려받은 행을 createDocumentDownloadUrl(document, { actor: null, req })에 넘긴다.
export const findSharedInvitationDocument = ({ invitationId, contractId, documentId }, client = prisma) =>
  client.document.findFirst({
    where: {
      id: documentId,
      resourceType: CONTRACT_RESOURCE,
      resourceId: contractId,
      deletedAt: null,
      invitationShares: { some: { invitationId, invitation: { contractId } } },
    },
  });

// GET /documents/:documentId/content?token= — 임시 로컬 저장소 전용 서명 다운로드. 문서 행과 파일 스트림을 여는 함수를 돌려준다.
// 스트림은 응답 헤더를 다 만든 뒤에 연다(그 사이 에러가 나면 열린 파일이 남지 않게).
export const openDocumentContent = async (documentId, token) => {
  const storage = requireStorage();
  if (!storage.servesContent) throwDocumentNotFound();
  if (storage.verifyDownloadToken({ documentId, token, now: getNow() }) !== 'ok') throwSignatureInvalid();
  const document = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
  if (!document) throwDocumentNotFound();
  return { document, openStream: () => storage.openObjectStream(document.storagePath) };
};

// DELETE /documents/:documentId — 올린 사람, 연결된 리소스를 수정할 수 있을 때. 잠긴 문서는 422.
export const deleteDocument = async (user, documentId, req) => {
  const found = await findVisibleDocument(user, documentId);
  assertDocumentsDeletable([found], user);
  const policy = found.resourceType ? getResourcePolicy(found.resourceType) : null;

  const storagePaths = await prisma.$transaction(async (tx) => {
    if (policy) await policy.lockForWrite(tx, user, found.resourceId);
    // 리소스를 잠그는 사이 소유가 끝나 잠겼거나 다른 요청이 지웠을 수 있다.
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throwDocumentNotFound();
    assertDocumentsDeletable([document], user);
    const paths = await softDeleteDocumentsInTx(tx, [document], getNow());
    await audit.record({
      actor: user,
      action: 'DOCUMENT_DELETED',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      summary: document.resourceType ? `${document.resourceType} 문서 삭제` : '미연결 문서 삭제',
      req,
      client: tx,
    });
    return paths;
  });
  await removeStoredObjects(storagePaths);
};

// 매일 cron: 만료된 업로드 세션(등록 안 된 것)과 24시간 안에 안 붙은 미연결 문서를 정리한다(결정 Q5).
// 저장소를 쓸 수 없으면 파일을 지울 수 없으므로 아무것도 하지 않는다.
// 행을 먼저 지우고(그 사이 등록·연결된 것은 남김) 지운 행의 파일만 지운다. 파일 삭제 실패는 다음 정리를 막지 않는다.
export const cleanupExpiredUploads = async ({ client = prisma, now = getNow() } = {}) => {
  if (!selectStorage()) return { skipped: 'storage unavailable' };
  const removedPaths = [];

  const uploads = await client.upload.findMany({
    where: { expiresAt: { lt: new Date(now.getTime() - UPLOAD_CLEANUP_GRACE_MS) }, document: null },
    select: { id: true, storagePath: true },
    orderBy: { expiresAt: 'asc' },
    take: CLEANUP_BATCH,
  });
  let uploadsDeleted = 0;
  for (const upload of uploads) {
    // 조회와 삭제 사이에 등록된 업로드는 남긴다(document: null 조건).
    const { count } = await client.upload.deleteMany({ where: { id: upload.id, document: null } });
    if (count === 0) continue;
    uploadsDeleted += 1;
    removedPaths.push(upload.storagePath);
  }

  const unattached = await client.document.findMany({
    where: { resourceType: null, deletedAt: null, createdAt: { lt: new Date(now.getTime() - UNATTACHED_DOCUMENT_TTL_MS) } },
    orderBy: { createdAt: 'asc' },
    take: CLEANUP_BATCH,
  });
  let documentsDeleted = 0;
  for (const document of unattached) {
    // 조회와 숨김 사이에 붙은 문서는 남긴다(파일도 지우지 않는다).
    const { count } = await client.document.updateMany({
      where: { id: document.id, resourceType: null, deletedAt: null },
      data: { deletedAt: now },
    });
    if (count === 0) continue;
    documentsDeleted += 1;
    removedPaths.push(document.storagePath);
  }
  await removeStoredObjects(removedPaths);
  return { uploadsDeleted, documentsDeleted };
};
