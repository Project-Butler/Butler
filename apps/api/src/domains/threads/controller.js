// 소통 요청 형식 검사와 응답. 권한·읽기 전용 규칙은 service.js.
import { AppError } from '../../platform/AppError.js';
import { decodeCreatedAtCursor } from '../../platform/createdAtCursor.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import {
  DEFAULT_MESSAGE_PAGE_SIZE,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_PAGE_SIZE,
  THREAD_CONTEXT_TYPES,
} from '../../platform/threadRules.js';
import { isUuid } from '../../platform/uuid.js';
import {
  findMessages,
  findThreadForUser,
  findThreads,
  markThreadRead,
  openThread,
  sendMessage,
  throwThreadNotFound,
} from './service.js';

const contextTypeReason = `${THREAD_CONTEXT_TYPES.join(', ')} 중 하나여야 합니다.`;

const parseOpenBody = (body) => {
  assertAllowedBody(body, ['contextType', 'contextId']);
  const details = [];
  if (!THREAD_CONTEXT_TYPES.includes(body.contextType)) details.push({ field: 'contextType', reason: contextTypeReason });
  if (!isUuid(body.contextId)) details.push({ field: 'contextId', reason: 'UUID여야 합니다.' });
  throwIfInvalid(details);
  return { contextType: body.contextType, contextId: body.contextId };
};

const parseThreadListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  if (query.contextType !== undefined && !THREAD_CONTEXT_TYPES.includes(query.contextType)) {
    details.push({ field: 'contextType', reason: contextTypeReason });
  }
  if (query.contextId !== undefined && !isUuid(query.contextId)) details.push({ field: 'contextId', reason: 'UUID여야 합니다.' });
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);
  return { contextType: query.contextType ?? null, contextId: query.contextId ?? null, page, size };
};

// cursor(지난 메시지)와 after(새 메시지)는 함께 쓸 수 없다. size 기본 30, 최대 100.
const parseMessageQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  let size = DEFAULT_MESSAGE_PAGE_SIZE;
  if (query.size !== undefined) {
    size = Number(query.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_MESSAGE_PAGE_SIZE) {
      details.push({ field: 'size', reason: `1~${MAX_MESSAGE_PAGE_SIZE} 사이 정수여야 합니다.` });
    }
  }
  let cursor = null;
  if (query.cursor !== undefined) {
    cursor = decodeCreatedAtCursor(query.cursor);
    if (!cursor) details.push({ field: 'cursor', reason: '올바르지 않은 커서입니다.' });
  }
  if (query.after !== undefined && !isUuid(query.after)) details.push({ field: 'after', reason: '메시지 id(UUID)여야 합니다.' });
  if (query.cursor !== undefined && query.after !== undefined) {
    details.push({ field: 'after', reason: 'cursor와 after는 함께 보낼 수 없습니다.' });
  }
  throwIfInvalid(details);
  return { cursor, after: query.after ?? null, size };
};

// 본문은 최대 2,000자. 첨부가 있으면 본문 없이 보낼 수 있다.
const parseMessageBody = (body) => {
  assertAllowedBody(body, ['body', 'attachmentDocumentIds']);
  const details = [];
  const attachmentDocumentIds = body.attachmentDocumentIds ?? [];
  const field = 'attachmentDocumentIds';
  if (!Array.isArray(attachmentDocumentIds)) details.push({ field, reason: '문서 id 배열이어야 합니다.' });
  else if (attachmentDocumentIds.length > MAX_MESSAGE_ATTACHMENTS) details.push({ field, reason: `${MAX_MESSAGE_ATTACHMENTS}개까지 붙일 수 있습니다.` });
  else if (!attachmentDocumentIds.every(isUuid)) details.push({ field, reason: 'UUID 배열이어야 합니다.' });
  else if (new Set(attachmentDocumentIds).size !== attachmentDocumentIds.length) details.push({ field, reason: '같은 문서를 두 번 넣을 수 없습니다.' });

  const text = typeof body.body === 'string' ? body.body.trim() : null;
  if (body.body !== undefined && body.body !== null && typeof body.body !== 'string') {
    details.push({ field: 'body', reason: '문자열이어야 합니다.' });
  } else if (text && text.length > MAX_MESSAGE_BODY_LENGTH) {
    details.push({ field: 'body', reason: `${MAX_MESSAGE_BODY_LENGTH}자 이하여야 합니다.` });
  } else if (!text && Array.isArray(attachmentDocumentIds) && attachmentDocumentIds.length === 0) {
    details.push({ field: 'body', reason: '내용이나 첨부 중 하나는 있어야 합니다.' });
  }
  throwIfInvalid(details);
  return { body: text ?? '', attachmentDocumentIds };
};

const parseReadBody = (body) => {
  assertAllowedBody(body, ['lastReadMessageId']);
  if (!isUuid(body.lastReadMessageId)) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
      { field: 'lastReadMessageId', reason: '메시지 id(UUID)여야 합니다.' },
    ]);
  }
  return { lastReadMessageId: body.lastReadMessageId };
};

const requireThreadId = (req) => {
  const { threadId } = req.params;
  if (!isUuid(threadId)) throwThreadNotFound();
  return threadId;
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postThread = async (req, res, next) => {
  try {
    const { thread, created } = await openThread(req.user, parseOpenBody(req.body));
    sendData(res, thread, { status: created ? 201 : 200 });
  } catch (error) {
    next(error);
  }
};

export const listThreads = async (req, res, next) => {
  try {
    const { items, meta } = await findThreads(req.user, parseThreadListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getThread = async (req, res, next) => {
  try {
    sendData(res, await findThreadForUser(req.user, requireThreadId(req)));
  } catch (error) {
    next(error);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    const threadId = requireThreadId(req);
    const { items, meta } = await findMessages(req.user, threadId, parseMessageQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const postMessage = async (req, res, next) => {
  try {
    const threadId = requireThreadId(req);
    sendData(res, await sendMessage(req.user, threadId, parseMessageBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const postThreadRead = async (req, res, next) => {
  try {
    const threadId = requireThreadId(req);
    await markThreadRead(req.user, threadId, parseReadBody(req.body));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
