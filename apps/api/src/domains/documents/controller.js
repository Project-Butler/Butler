// 파일·문서 요청 형식 검사와 응답. 권한·상태 규칙은 service.js.
import { AppError } from '../../platform/AppError.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import {
  DOCUMENT_RESOURCE_TYPES,
  DOCUMENT_TYPES,
  isAllowedMimeType,
  MAX_FILE_BYTES,
  MAX_FILE_NAME_LENGTH,
} from './fileRules.js';
import { SUPPORTED_RESOURCE_TYPES } from './resourcePolicies.js';
import {
  createUploadSession,
  deleteDocument,
  findDocumentForUser,
  findResourceDocuments,
  issueDownloadUrl,
  openDocumentContent,
  receiveUploadContent,
  registerDocument,
} from './service.js';

const UPLOAD_SESSION_FIELDS = ['fileName', 'mimeType', 'sizeBytes', 'documentType'];
const DOCUMENT_FIELDS = ['uploadSessionId', 'resourceType', 'resourceId'];

const throwDocumentNotFound = () => {
  throw new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.');
};

const parseUploadSessionBody = (body) => {
  assertAllowedBody(body, UPLOAD_SESSION_FIELDS);
  const details = [];
  const { fileName, mimeType, sizeBytes, documentType } = body;
  if (typeof fileName !== 'string' || fileName.trim().length === 0 || fileName.length > MAX_FILE_NAME_LENGTH) {
    details.push({ field: 'fileName', reason: `1~${MAX_FILE_NAME_LENGTH}자 문자열이어야 합니다.` });
  }
  if (typeof mimeType !== 'string') details.push({ field: 'mimeType', reason: '필수 값입니다.' });
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) details.push({ field: 'sizeBytes', reason: '1 이상의 정수여야 합니다.' });
  if (!DOCUMENT_TYPES.includes(documentType)) {
    details.push({ field: 'documentType', reason: `${DOCUMENT_TYPES.join(', ')} 중 하나여야 합니다.` });
  }
  throwIfInvalid(details);

  if (!isAllowedMimeType(mimeType)) throw new AppError('FILE_TYPE_NOT_ALLOWED', 422, 'JPEG·PNG·WEBP·HEIC 사진과 PDF만 올릴 수 있습니다.');
  if (sizeBytes > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE', 422, '파일은 20MB까지 올릴 수 있습니다.');
  return { fileName: fileName.trim(), mimeType, sizeBytes, documentType };
};

// resourceType·resourceId는 둘 다 넣거나 둘 다 뺀다. 권한 확인을 구현한 resourceType만 받는다.
const parseResource = (source, details, { required }) => {
  const { resourceType, resourceId } = source;
  const hasType = resourceType !== undefined && resourceType !== null;
  const hasId = resourceId !== undefined && resourceId !== null;
  if (!hasType && !hasId) {
    if (required) details.push({ field: 'resourceType', reason: '필수 값입니다.' }, { field: 'resourceId', reason: '필수 값입니다.' });
    return {};
  }
  if (hasType !== hasId) {
    details.push({ field: hasType ? 'resourceId' : 'resourceType', reason: 'resourceType과 resourceId는 함께 보내야 합니다.' });
    return {};
  }
  if (!DOCUMENT_RESOURCE_TYPES.includes(resourceType)) {
    details.push({ field: 'resourceType', reason: `${DOCUMENT_RESOURCE_TYPES.join(', ')} 중 하나여야 합니다.` });
  } else if (!SUPPORTED_RESOURCE_TYPES.includes(resourceType)) {
    details.push({ field: 'resourceType', reason: `아직 ${SUPPORTED_RESOURCE_TYPES.join(', ')}에만 문서를 붙일 수 있습니다.` });
  }
  if (!isUuid(resourceId)) details.push({ field: 'resourceId', reason: 'UUID여야 합니다.' });
  return { resourceType, resourceId };
};

const parseDocumentBody = (body) => {
  assertAllowedBody(body, DOCUMENT_FIELDS);
  const details = [];
  if (!isUuid(body.uploadSessionId)) details.push({ field: 'uploadSessionId', reason: 'UUID여야 합니다.' });
  const resource = parseResource(body, details, { required: false });
  throwIfInvalid(details);
  return { uploadSessionId: body.uploadSessionId, ...resource };
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const resource = parseResource(query, details, { required: true });
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);
  return { ...resource, page, size };
};

// 브라우저가 이름을 그대로 보여 주도록 RFC 5987 형식으로 넣는다.
const toContentDisposition = (fileName) => `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postUploadSession = async (req, res, next) => {
  try {
    sendData(res, await createUploadSession(req.user, parseUploadSessionBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const putUploadContent = async (req, res, next) => {
  try {
    const { uploadId } = req.params;
    if (!isUuid(uploadId)) throw new AppError('UPLOAD_SESSION_NOT_FOUND', 404, '업로드 세션을 찾을 수 없습니다.');
    await receiveUploadContent(uploadId, req.query.token, req.body);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const postDocument = async (req, res, next) => {
  try {
    sendData(res, await registerDocument(req.user, parseDocumentBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const listDocuments = async (req, res, next) => {
  try {
    const { items, meta } = await findResourceDocuments(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) throwDocumentNotFound();
    sendData(res, await findDocumentForUser(req.user, documentId));
  } catch (error) {
    next(error);
  }
};

export const postDownloadUrl = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) throwDocumentNotFound();
    sendData(res, await issueDownloadUrl(req.user, documentId, req));
  } catch (error) {
    next(error);
  }
};

export const getDocumentContent = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) throwDocumentNotFound();
    const { document, stream } = await openDocumentContent(documentId, req.query.token);
    stream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      next(error.code === 'ENOENT' ? new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.') : error);
    });
    stream.on('open', () => {
      res.status(200);
      res.set({
        'Content-Type': document.mimeType,
        'Content-Length': String(document.sizeBytes),
        'Content-Disposition': toContentDisposition(document.fileName),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      });
      stream.pipe(res);
    });
  } catch (error) {
    next(error);
  }
};

export const removeDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) throwDocumentNotFound();
    await deleteDocument(req.user, documentId, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
