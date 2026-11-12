// 티켓 요청 형식 검사와 응답. 권한·상태 규칙은 service.js.
import { AppError } from '../../platform/AppError.js';
import { MAX_TICKET_ATTACHMENTS } from '../documents/fileRules.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import {
  MAX_TICKET_DESCRIPTION_LENGTH,
  MAX_TICKET_RESOLUTION_NOTE_LENGTH,
  MAX_TICKET_TITLE_LENGTH,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
} from '../../platform/ticketRules.js';
import { isUuid } from '../../platform/uuid.js';
import { createTicket, findTicketForUser, findTickets, throwTicketNotFound, updateTicket } from './service.js';

const CREATE_FIELDS = ['propertyId', 'category', 'title', 'description', 'attachmentDocumentIds'];
const UPDATE_FIELDS = ['title', 'description', 'status', 'resolutionNote', 'cost'];
const SORT_PATTERN = /^createdAt(?::(asc|desc))?$/;

const parseText = (field, max) => (value, details) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length >= 1 && text.length <= max) return text;
  details.push({ field, reason: `1~${max}자여야 합니다.` });
  return undefined;
};

const parseTitle = parseText('title', MAX_TICKET_TITLE_LENGTH);
const parseDescription = parseText('description', MAX_TICKET_DESCRIPTION_LENGTH);

const parseResolutionNote = (value, details) => {
  if (value === null) return null;
  if (typeof value === 'string' && value.length <= MAX_TICKET_RESOLUTION_NOTE_LENGTH) return value.trim() || null;
  details.push({ field: 'resolutionNote', reason: `${MAX_TICKET_RESOLUTION_NOTE_LENGTH}자 이하 문자열 또는 null이어야 합니다.` });
  return undefined;
};

// 원 단위 정수 → DB bigint. 비용이 없으면 null.
const parseCost = (value, details) => {
  if (value === null) return null;
  if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  details.push({ field: 'cost', reason: '0 이상의 정수 또는 null이어야 합니다.' });
  return undefined;
};

const parseEnum = (field, allowed) => (value, details) => {
  if (allowed.includes(value)) return value;
  details.push({ field, reason: `${allowed.join(', ')} 중 하나여야 합니다.` });
  return undefined;
};

const UPDATE_PARSERS = {
  title: parseTitle,
  description: parseDescription,
  status: parseEnum('status', TICKET_STATUSES),
  resolutionNote: parseResolutionNote,
  cost: parseCost,
};

// 미연결 문서 id 목록. 최대 10개, 중복 없음.
const parseAttachmentIds = (value, details) => {
  const field = 'attachmentDocumentIds';
  if (!Array.isArray(value)) {
    details.push({ field, reason: '문서 id 배열이어야 합니다.' });
    return undefined;
  }
  if (value.length > MAX_TICKET_ATTACHMENTS) details.push({ field, reason: `${MAX_TICKET_ATTACHMENTS}개까지 붙일 수 있습니다.` });
  else if (!value.every(isUuid)) details.push({ field, reason: 'UUID 배열이어야 합니다.' });
  else if (new Set(value).size !== value.length) details.push({ field, reason: '같은 문서를 두 번 넣을 수 없습니다.' });
  return value;
};

const parseCreateBody = (body) => {
  assertAllowedBody(body, CREATE_FIELDS);
  const details = [];
  for (const field of ['propertyId', 'category', 'title', 'description']) {
    if (body[field] === undefined || body[field] === null) details.push({ field, reason: '필수 값입니다.' });
  }
  throwIfInvalid(details);

  if (!isUuid(body.propertyId)) details.push({ field: 'propertyId', reason: 'UUID여야 합니다.' });
  const input = {
    propertyId: body.propertyId,
    category: parseEnum('category', TICKET_CATEGORIES)(body.category, details),
    title: parseTitle(body.title, details),
    description: parseDescription(body.description, details),
    attachmentDocumentIds: parseAttachmentIds(body.attachmentDocumentIds ?? [], details),
  };
  throwIfInvalid(details);
  return input;
};

const parseUpdateBody = (body) => {
  assertAllowedBody(body, UPDATE_FIELDS);
  if (Object.keys(body).length === 0) {
    throw new AppError('VALIDATION_ERROR', 400, '수정할 값이 없습니다.', [
      { field: 'body', reason: `${UPDATE_FIELDS.join(', ')} 중 하나 이상이 필요합니다.` },
    ]);
  }
  const details = [];
  const data = {};
  for (const field of UPDATE_FIELDS) {
    if (body[field] !== undefined) data[field] = UPDATE_PARSERS[field](body[field], details);
  }
  throwIfInvalid(details);
  return data;
};

// 쉼표로 여러 값. 빈 값은 필터 없음.
const parseCsv = (value, field, allowed, details) => {
  if (value === undefined || value === '') return [];
  const values = value.split(',').map((item) => item.trim());
  if (values.some((item) => !allowed.includes(item))) details.push({ field, reason: `${allowed.join(', ')} 중에서 쉼표로 고릅니다.` });
  return values;
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  if (query.propertyId !== undefined && !isUuid(query.propertyId)) details.push({ field: 'propertyId', reason: 'UUID여야 합니다.' });
  const statuses = parseCsv(query.status, 'status', TICKET_STATUSES, details);
  const categories = parseCsv(query.category, 'category', TICKET_CATEGORIES, details);
  const sortMatch = SORT_PATTERN.exec(query.sort ?? 'createdAt:desc');
  if (!sortMatch) details.push({ field: 'sort', reason: 'createdAt 또는 createdAt:asc|desc 형식이어야 합니다.' });
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);

  return {
    propertyId: query.propertyId ?? null,
    statuses,
    categories,
    sortDirection: sortMatch[1] ?? 'desc',
    page,
    size,
  };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postTicket = async (req, res, next) => {
  try {
    sendData(res, await createTicket(req.user, parseCreateBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const listTickets = async (req, res, next) => {
  try {
    const { items, meta } = await findTickets(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const ticket = isUuid(ticketId) ? await findTicketForUser(req.user, ticketId) : null;
    if (!ticket) throwTicketNotFound();
    sendData(res, ticket);
  } catch (error) {
    next(error);
  }
};

export const patchTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    if (!isUuid(ticketId)) throwTicketNotFound();
    sendData(res, await updateTicket(req.user, ticketId, parseUpdateBody(req.body), req));
  } catch (error) {
    next(error);
  }
};
