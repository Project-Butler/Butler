// 파일·문서(계약 6장). 업로드 순서: 업로드 세션 → uploadUrl로 PUT → POST /documents 등록.
// 저장소는 storage/index.js가 고른다(지금은 임시 로컬 저장소뿐). 못 쓰면 503 STORAGE_UNAVAILABLE.
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow } from '../../platform/dateUtils.js';
import { assertDocumentsDeletable, softDeleteDocumentsInTx } from '../../platform/documentAttachments.js';
import { prisma } from '../../platform/prismaClient.js';
import { AUDITED_DOWNLOAD_TYPES, MAX_FILE_BYTES, matchesDeclaredType, toStoragePath } from './fileRules.js';
import { getResourcePolicy } from './resourcePolicies.js';
import { removeStoredObjects, selectStorage } from './storage/index.js';

// 결정 Q2: 업로드 15분, 다운로드 5분
export const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;
// 미연결 문서는 24시간 안에 안 붙으면 정리한다(계약 6장)
export const UNATTACHED_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;
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
  const target = storage.createUploadTarget({ uploadId: id, mimeType, expiresAt });
  return { id, ...target, expiresAt: expiresAt.toISOString() };
};

// PUT /files/upload-sessions/:id/content — 임시 로컬 저장소 전용. 쿠키 대신 서명으로 판단한다.
export const receiveUploadContent = async (uploadId, token, body) => {
  const storage = requireStorage();
  if (!storage.servesContent) throwUploadSessionNotFound();
  const now = getNow();
  const tokenState = storage.verifyUploadToken({ uploadId, token, now });
  if (tokenState === 'invalid') throwSignatureInvalid();
  if (tokenState === 'expired') throwUploadSessionExpired();

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
  });
  return toDocumentResponse(document);
};

// 문서를 볼 수 있는지. 미연결 문서는 올린 사람만, 붙은 문서는 그 리소스를 볼 수 있는 사람만.
const canViewDocument = async (user, document) => {
  if (!document.resourceType) return document.uploaderId === user.id;
  const policy = getResourcePolicy(document.resourceType);
  if (!policy) return document.uploaderId === user.id;
  return policy.canView(user, document.resourceId);
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
  const where = { resourceType, resourceId, deletedAt: null };
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * size, take: size }),
  ]);
  return { items: rows.map(toDocumentResponse), meta: { page, size, total, hasNext: page * size < total } };
};

// GET /documents/:documentId
export const findDocumentForUser = async (user, documentId) => toDocumentResponse(await findVisibleDocument(user, documentId));

// POST /documents/:documentId/download-url — 5분 유효. 계약서·등기부는 감사 로그에 남긴다.
export const issueDownloadUrl = async (user, documentId, req) => {
  const document = await findVisibleDocument(user, documentId);
  const storage = requireStorage();
  const expiresAt = new Date(getNow().getTime() + DOWNLOAD_URL_TTL_MS);
  const url = storage.createDownloadUrl({ documentId: document.id, storagePath: document.storagePath, fileName: document.fileName, expiresAt });
  if (AUDITED_DOWNLOAD_TYPES.includes(document.type)) {
    await audit.record({
      actor: user,
      action: 'DOCUMENT_DOWNLOAD_URL_ISSUED',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      summary: `${document.type} 다운로드 URL 발급`,
      req,
    });
  }
  return { url, expiresAt: expiresAt.toISOString() };
};

// GET /documents/:documentId/content?token= — 임시 로컬 저장소 전용 서명 다운로드. 문서 행과 열 파일 스트림을 돌려준다.
export const openDocumentContent = async (documentId, token) => {
  const storage = requireStorage();
  if (!storage.servesContent) throwDocumentNotFound();
  if (storage.verifyDownloadToken({ documentId, token, now: getNow() }) !== 'ok') throwSignatureInvalid();
  const document = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
  if (!document) throwDocumentNotFound();
  return { document, stream: storage.openObjectStream(document.storagePath) };
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
export const cleanupExpiredUploads = async ({ client = prisma, now = getNow() } = {}) => {
  const storage = selectStorage();
  if (!storage) return { skipped: 'storage unavailable' };

  const uploads = await client.upload.findMany({
    where: { expiresAt: { lt: now }, document: null },
    select: { id: true, storagePath: true },
    orderBy: { expiresAt: 'asc' },
    take: CLEANUP_BATCH,
  });
  for (const upload of uploads) {
    await storage.deleteObject(upload.storagePath);
  }
  // 그 사이 등록된 업로드는 남긴다(document: null 조건).
  const { count: uploadsDeleted } = await client.upload.deleteMany({
    where: { id: { in: uploads.map((upload) => upload.id) }, document: null },
  });

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
    await storage.deleteObject(document.storagePath);
  }
  return { uploadsDeleted, documentsDeleted };
};
