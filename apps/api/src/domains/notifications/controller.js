import { AppError } from '../../platform/AppError.js';
import { decodeCreatedAtCursor } from '../../platform/createdAtCursor.js';
import { assertAllowedBody, assertSingleValues, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import {
  countMyUnreadNotifications,
  findMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './service.js';

// api-contract.md 1장 "목록 조회": 커서 방식 size 기본 30, 최대 100
const DEFAULT_SIZE = 30;
const MAX_SIZE = 100;

export const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];

  let size = DEFAULT_SIZE;
  if (query.size !== undefined) {
    size = Number(query.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_SIZE) {
      details.push({ field: 'size', reason: `1 이상 ${MAX_SIZE} 이하의 정수여야 합니다.` });
    }
  }

  if (query.unreadOnly !== undefined && query.unreadOnly !== 'true' && query.unreadOnly !== 'false') {
    details.push({ field: 'unreadOnly', reason: 'true 또는 false여야 합니다.' });
  }

  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeCreatedAtCursor(query.cursor);
    if (!cursor) details.push({ field: 'cursor', reason: '올바르지 않은 커서입니다.' });
  }

  throwIfInvalid(details);
  return { size, unreadOnly: query.unreadOnly === 'true', cursor };
};

const notFound = () => new AppError('NOTIFICATION_NOT_FOUND', 404, '알림을 찾을 수 없습니다.');

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.

// GET /notifications?size=30&unreadOnly=false&cursor=
export const listNotifications = async (req, res, next) => {
  try {
    const { items, meta } = await findMyNotifications(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

// GET /notifications/unread-count
export const getUnreadCount = async (req, res, next) => {
  try {
    sendData(res, await countMyUnreadNotifications(req.user));
  } catch (error) {
    next(error);
  }
};

// POST /notifications/:notificationId/read — 204. 형식이 틀린 id도 없는 알림과 같은 404.
export const postRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    if (!isUuid(notificationId)) throw notFound();
    assertAllowedBody(req.body ?? {}, []);
    await markNotificationRead(req.user, notificationId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

// POST /notifications/read-all — 204.
export const postReadAll = async (req, res, next) => {
  try {
    assertAllowedBody(req.body ?? {}, []);
    await markAllNotificationsRead(req.user);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
