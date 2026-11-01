import { AppError } from '../../platform/AppError.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { decodeAuditLogCursor } from './auditLogCursor.js';
import {
  changeUserStatus,
  findAdminUser,
  findAdminUsers,
  findAuditLogs,
  getDashboardCounts,
  refreshJusoReferenceData,
  refreshKaptReferenceData,
  USER_ROLES,
  USER_STATUSES,
} from './service.js';
import { ADMIN_SETTABLE_STATUSES } from './userStatusChange.js';

const MAX_QUERY_LENGTH = 100;
const MAX_REASON_LENGTH = 500;
// api-contract.md 1장 "목록 조회": 커서 방식 size 기본 30, 최대 100
const DEFAULT_CURSOR_SIZE = 30;
const MAX_CURSOR_SIZE = 100;

const parseEnum = (value, field, values, details) => {
  if (value === undefined) return undefined;
  if (!values.includes(value)) {
    details.push({ field, reason: `${values.join(', ')} 중 하나여야 합니다.` });
    return undefined;
  }
  return value;
};

const parseUserListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const keyword = query.query?.trim() || undefined;
  if (keyword && keyword.length > MAX_QUERY_LENGTH) {
    details.push({ field: 'query', reason: `${MAX_QUERY_LENGTH}자 이하여야 합니다.` });
  }
  const role = parseEnum(query.role, 'role', USER_ROLES, details);
  const status = parseEnum(query.status, 'status', USER_STATUSES, details);
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);
  return { query: keyword, role, status, page, size };
};

const parseStatusBody = (body) => {
  assertAllowedBody(body, ['status', 'reason']);
  const details = [];
  const status = parseEnum(body.status, 'status', ADMIN_SETTABLE_STATUSES, details);
  if (body.status === undefined) details.push({ field: 'status', reason: '필수 값입니다.' });

  let reason = body.reason ?? null;
  if (reason !== null && typeof reason !== 'string') {
    details.push({ field: 'reason', reason: '문자열이어야 합니다.' });
  } else {
    reason = reason?.trim() || null;
    if (reason && reason.length > MAX_REASON_LENGTH) {
      details.push({ field: 'reason', reason: `${MAX_REASON_LENGTH}자 이하여야 합니다.` });
    }
    if (status === 'SUSPENDED' && !reason) details.push({ field: 'reason', reason: '정지 사유를 입력해 주세요.' });
  }
  throwIfInvalid(details);
  return { status, reason };
};

const parseDateTime = (value, field, details) => {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    details.push({ field, reason: 'ISO 8601 시각이어야 합니다.' });
    return undefined;
  }
  return date;
};

const parseAuditLogQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  for (const field of ['actorId', 'resourceId']) {
    if (query[field] !== undefined && !isUuid(query[field])) details.push({ field, reason: 'UUID 형식이어야 합니다.' });
  }
  const from = parseDateTime(query.from, 'from', details);
  const to = parseDateTime(query.to, 'to', details);

  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeAuditLogCursor(query.cursor);
    if (!cursor) details.push({ field: 'cursor', reason: '올바르지 않은 커서입니다.' });
  }

  let size = DEFAULT_CURSOR_SIZE;
  if (query.size !== undefined) {
    size = Number(query.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_CURSOR_SIZE) {
      details.push({ field: 'size', reason: `1 이상 ${MAX_CURSOR_SIZE} 이하의 정수여야 합니다.` });
    }
  }
  throwIfInvalid(details);
  return {
    actorId: query.actorId,
    action: query.action,
    resourceType: query.resourceType,
    resourceId: query.resourceId,
    from,
    to,
    cursor,
    size,
  };
};

const throwUserNotFound = () => {
  throw new AppError('USER_NOT_FOUND', 404, '회원을 찾을 수 없습니다.');
};

// POST /api/v1/admin/reference-data/juso/refresh — 관리자가 juso 참고 데이터를 지금 갱신한다(본문 없음).
// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const refreshJuso = async (req, res, next) => {
  try {
    assertAllowedBody(req.body ?? {}, []);
    sendData(res, await refreshJusoReferenceData(req.user));
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/reference-data/kapt/refresh — 관리자가 K-apt 최신 기본정보 엑셀을 지금 넣는다(본문 없음).
export const refreshKapt = async (req, res, next) => {
  try {
    assertAllowedBody(req.body ?? {}, []);
    sendData(res, await refreshKaptReferenceData(req.user));
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/dashboard
export const getDashboard = async (req, res, next) => {
  try {
    sendData(res, await getDashboardCounts());
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/users?query=&role=&status=&page=&size=
export const listUsers = async (req, res, next) => {
  try {
    const { items, meta } = await findAdminUsers(parseUserListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/users/:userId
export const getUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = isUuid(userId) ? await findAdminUser(userId) : null;
    if (!user) throwUserNotFound();
    sendData(res, user);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/users/:userId/status — { status: 'ACTIVE' | 'SUSPENDED', reason }
export const patchUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) throwUserNotFound();
    sendData(res, await changeUserStatus(req.user, userId, parseStatusBody(req.body), req));
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/audit-logs — 커서 방식(api-contract.md 8장). to는 그 시각 미만.
export const listAuditLogs = async (req, res, next) => {
  try {
    const { items, meta } = await findAuditLogs(parseAuditLogQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};
