// 파일·문서 요청 형식 검사와 응답. 권한·상태 규칙은 service.js.
import { pipeline } from 'node:stream';
import { AppError } from '../../platform/AppError.js';
import { getNow } from '../../platform/dateUtils.js';
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
  verifyUploadRequest,
} from './service.js';

const UPLOAD_SESSION_FIELDS = ['fileName', 'mimeType', 'sizeBytes', 'documentType'];
const DOCUMENT_FIELDS = ['uploadSessionId', 'resourceType', 'resourceId'];

const throwDocumentNotFound = () => {
  throw new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.');
};

const throwUploadSessionNotFound = () => {
  throw new AppError('UPLOAD_SESSION_NOT_FOUND', 404, '업로드 세션을 찾을 수 없습니다.');
};

// 다운로드 응답의 Content-Disposition·화면 표시에 쓰므로 깨진 유니코드(짝 없는 서로게이트)와 제어 문자는 받지 않는다.
const CONTROL_CHAR_PATTERN = /\p{Cc}/u;
const isValidFileName = (fileName) =>
  typeof fileName === 'string' &&
  fileName.trim().length > 0 &&
  fileName.length <= MAX_FILE_NAME_LENGTH &&
  fileName.isWellFormed() &&
  !CONTROL_CHAR_PATTERN.test(fileName);

const parseUploadSessionBody = (body) => {
  assertAllowedBody(body, UPLOAD_SESSION_FIELDS);
  const details = [];
  const { fileName, mimeType, sizeBytes, documentType } = body;
  if (!isValidFileName(fileName)) {
    details.push({ field: 'fileName', reason: `제어 문자 없는 1~${MAX_FILE_NAME_LENGTH}자 문자열이어야 합니다.` });
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

// 브라우저가 이름을 그대로 보여 주도록 RFC 5987 형식으로 넣는다. encodeURIComponent가 남기는 '()*도 RFC 5987에서는 인코딩한다.
const encodeRfc5987 = (value) =>
  encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const toContentDisposition = (fileName) => `inline; filename*=UTF-8''${encodeRfc5987(fileName)}`;

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postUploadSession = async (req, res, next) => {
  try {
    sendData(res, await createUploadSession(req.user, parseUploadSessionBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

// 업로드 본문(최대 20MB)을 읽기 전에 경로·서명·저장소부터 본다. 틀리면 본문을 받지 않고 바로 거절한다.
export const checkUploadContent = (req, res, next) => {
  try {
    const { uploadId } = req.params;
    if (!isUuid(uploadId)) throwUploadSessionNotFound();
    verifyUploadRequest(uploadId, req.query.token, getNow());
    next();
  } catch (error) {
    next(error);
  }
};

// express.raw의 크기 초과(413)는 공통 처리에서 400이 되므로, 업로드 본문 경로에서는 계약대로 422 FILE_TOO_LARGE로 바꾼다.
export const mapUploadBodyError = (error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    next(new AppError('FILE_TOO_LARGE', 422, '파일은 20MB까지 올릴 수 있습니다.'));
    return;
  }
  next(error);
};

export const putUploadContent = async (req, res, next) => {
  try {
    const { uploadId } = req.params;
    if (!isUuid(uploadId)) throwUploadSessionNotFound();
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
    const { document, openStream } = await openDocumentContent(documentId, req.query.token);
    const headers = {
      'Content-Type': document.mimeType,
      'Content-Length': String(document.sizeBytes),
      'Content-Disposition': toContentDisposition(document.fileName),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // 주소를 직접 열어도 스크립트가 돌지 않게 한다(PDF 등).
      'Content-Security-Policy': "sandbox; default-src 'none'",
    };
    const stream = openStream();
    let started = false;
    // 다 보내기 전에 연결이 끊기면 파일을 닫는다.
    res.once('close', () => stream.destroy());
    // 열기 전 에러(파일 없음 등)만 여기서 응답한다. 보내기 시작한 뒤의 에러는 pipeline이 응답을 끊는다.
    stream.once('error', (error) => {
      if (started) return;
      next(error.code === 'ENOENT' ? new AppError('DOCUMENT_NOT_FOUND', 404, '문서를 찾을 수 없습니다.') : error);
    });
    stream.once('open', () => {
      started = true;
      res.status(200).set(headers);
      pipeline(stream, res, (error) => {
        if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error('[documents] 다운로드 전송 실패', error.code ?? error.message);
      });
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
