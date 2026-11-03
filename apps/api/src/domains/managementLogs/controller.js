// 관리 로그 요청 형식 검사와 응답. 권한·상태 규칙은 service.js.
import { AppError } from '../../platform/AppError.js';
import { MAX_LOG_ATTACHMENTS } from '../documents/fileRules.js';
import {
  isValidLogDate,
  MANAGEMENT_LOG_EDITABLE_FIELDS,
  MANAGEMENT_LOG_SCOPES,
  MANAGEMENT_LOG_TYPES,
  MANAGEMENT_LOG_WRITABLE_TYPES,
} from '../../platform/managementLogRules.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import {
  createManagementLog,
  deleteManagementLog,
  findManagementLogForUser,
  findManagementLogs,
  findPropertyManagementLogs,
  updateManagementLog,
} from './service.js';

const CREATE_FIELDS = ['scope', ...MANAGEMENT_LOG_EDITABLE_FIELDS, 'attachmentDocumentIds'];
// 수정은 첨부의 최종 목록을 받는다(빠진 문서는 삭제, 새 문서는 붙임).
const UPDATE_FIELDS = [...MANAGEMENT_LOG_EDITABLE_FIELDS, 'attachmentDocumentIds'];
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;
const SORT_PATTERN = /^occurredOn:(asc|desc)$/;

const throwPropertyNotFound = () => {
  throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');
};

const throwLogNotFound = () => {
  throw new AppError('MANAGEMENT_LOG_NOT_FOUND', 404, '관리 로그를 찾을 수 없습니다.');
};

const FIELD_PARSERS = {
  type: (value, details) => {
    if (MANAGEMENT_LOG_WRITABLE_TYPES.includes(value)) return value;
    details.push({ field: 'type', reason: `${MANAGEMENT_LOG_WRITABLE_TYPES.join(', ')} 중 하나여야 합니다.` });
    return undefined;
  },
  title: (value, details) => {
    const title = typeof value === 'string' ? value.trim() : '';
    if (title.length >= 1 && title.length <= MAX_TITLE_LENGTH) return title;
    details.push({ field: 'title', reason: `1~${MAX_TITLE_LENGTH}자여야 합니다.` });
    return undefined;
  },
  content: (value, details) => {
    if (value === null) return null;
    if (typeof value === 'string' && value.length <= MAX_CONTENT_LENGTH) return value.trim() || null;
    details.push({ field: 'content', reason: `${MAX_CONTENT_LENGTH}자 이하 문자열이어야 합니다.` });
    return undefined;
  },
  occurredOn: (value, details) => {
    if (isValidLogDate(value)) return value;
    details.push({ field: 'occurredOn', reason: 'YYYY-MM-DD 날짜여야 합니다.' });
    return undefined;
  },
  // 원 단위 정수 → DB bigint. 비용 없는 기록은 null.
  cost: (value, details) => {
    if (value === null) return null;
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    details.push({ field: 'cost', reason: '0 이상의 정수 또는 null이어야 합니다.' });
    return undefined;
  },
};

// 미연결 문서 id 목록. 최대 10개, 중복 없음.
const parseAttachmentIds = (value, details) => {
  const field = 'attachmentDocumentIds';
  if (!Array.isArray(value)) {
    details.push({ field, reason: '문서 id 배열이어야 합니다.' });
    return undefined;
  }
  if (value.length > MAX_LOG_ATTACHMENTS) details.push({ field, reason: `${MAX_LOG_ATTACHMENTS}개까지 붙일 수 있습니다.` });
  else if (!value.every(isUuid)) details.push({ field, reason: 'UUID 배열이어야 합니다.' });
  else if (new Set(value).size !== value.length) details.push({ field, reason: '같은 문서를 두 번 넣을 수 없습니다.' });
  return value;
};

const parseFields = (body, details) => {
  const data = {};
  for (const field of MANAGEMENT_LOG_EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = FIELD_PARSERS[field](body[field], details);
  }
  return data;
};

const parseCreateBody = (body) => {
  assertAllowedBody(body, CREATE_FIELDS);
  const details = [];
  for (const field of ['type', 'title', 'occurredOn']) {
    if (body[field] === undefined || body[field] === null) details.push({ field, reason: '필수 값입니다.' });
  }
  throwIfInvalid(details);

  const scope = body.scope ?? 'PRIVATE';
  if (!MANAGEMENT_LOG_SCOPES.includes(scope)) {
    details.push({ field: 'scope', reason: `${MANAGEMENT_LOG_SCOPES.join(', ')} 중 하나여야 합니다.` });
  }
  const attachmentDocumentIds = parseAttachmentIds(body.attachmentDocumentIds ?? [], details);
  const data = parseFields(body, details);
  throwIfInvalid(details);
  return { scope, ...data, attachmentDocumentIds };
};

const parseUpdateBody = (body) => {
  assertAllowedBody(body, UPDATE_FIELDS);
  if (Object.keys(body).length === 0) {
    throw new AppError('VALIDATION_ERROR', 400, '수정할 값이 없습니다.', [
      { field: 'body', reason: `${UPDATE_FIELDS.join(', ')} 중 하나 이상이 필요합니다.` },
    ]);
  }
  const details = [];
  for (const field of ['type', 'title', 'occurredOn']) {
    if (body[field] === null) details.push({ field, reason: '비울 수 없습니다.' });
  }
  throwIfInvalid(details);
  const data = parseFields(body, details);
  if (body.attachmentDocumentIds !== undefined) data.attachmentDocumentIds = parseAttachmentIds(body.attachmentDocumentIds, details);
  throwIfInvalid(details);
  return data;
};

// L-02·L-03 공통. L-03만 propertyId·until을, 둘 다 scope·type을 받는다.
const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  if (query.propertyId !== undefined && !isUuid(query.propertyId)) details.push({ field: 'propertyId', reason: 'UUID여야 합니다.' });
  if (query.scope !== undefined && !MANAGEMENT_LOG_SCOPES.includes(query.scope)) {
    details.push({ field: 'scope', reason: `${MANAGEMENT_LOG_SCOPES.join(', ')} 중 하나여야 합니다.` });
  }
  const types = query.type ? query.type.split(',').map((type) => type.trim()) : [];
  if (types.some((type) => !MANAGEMENT_LOG_TYPES.includes(type))) {
    details.push({ field: 'type', reason: `${MANAGEMENT_LOG_TYPES.join(', ')} 중에서 쉼표로 고릅니다.` });
  }
  if (query.until !== undefined && !isValidLogDate(query.until)) {
    details.push({ field: 'until', reason: 'YYYY-MM-DD 날짜여야 합니다.' });
  }
  const sortMatch = SORT_PATTERN.exec(query.sort ?? 'occurredOn:desc');
  if (!sortMatch) details.push({ field: 'sort', reason: 'occurredOn:asc|desc 형식이어야 합니다.' });
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);

  return {
    propertyId: query.propertyId ?? null,
    scope: query.scope ?? null,
    types,
    until: query.until ?? null,
    sortDirection: sortMatch[1],
    page,
    size,
  };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postPropertyManagementLog = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    if (!isUuid(propertyId)) throwPropertyNotFound();
    sendData(res, await createManagementLog(req.user, propertyId, parseCreateBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const listPropertyManagementLogs = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    if (!isUuid(propertyId)) throwPropertyNotFound();
    const { items, meta } = await findPropertyManagementLogs(req.user, propertyId, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const listManagementLogs = async (req, res, next) => {
  try {
    const { items, meta } = await findManagementLogs(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getManagementLog = async (req, res, next) => {
  try {
    const { logId } = req.params;
    const log = isUuid(logId) ? await findManagementLogForUser(req.user, logId) : null;
    if (!log) throwLogNotFound();
    sendData(res, log);
  } catch (error) {
    next(error);
  }
};

export const patchManagementLog = async (req, res, next) => {
  try {
    const { logId } = req.params;
    if (!isUuid(logId)) throwLogNotFound();
    sendData(res, await updateManagementLog(req.user, logId, parseUpdateBody(req.body), req));
  } catch (error) {
    next(error);
  }
};

export const removeManagementLog = async (req, res, next) => {
  try {
    const { logId } = req.params;
    if (!isUuid(logId)) throwLogNotFound();
    await deleteManagementLog(req.user, logId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
