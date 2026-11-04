import { AppError } from '../../platform/AppError.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { decodeCreatedAtCursor } from '../../platform/createdAtCursor.js';
import { ATTEMPT_STATUSES, MAX_VALIDITY_YEARS, parseValidityYears, VERIFICATION_REASON_CODES } from '../../platform/ownershipVerificationRules.js';
import { parseComplexBody } from './complexInput.js';
import { OWNERSHIP_FILTER_STATUSES } from './ownershipFilter.js';
import {
  changeUserStatus,
  createComplex,
  endOwnershipByAdmin,
  findAdminJobs,
  findAdminOwnerships,
  findAdminUser,
  findAdminUsers,
  findAuditLogs,
  findOwnershipVerificationAttempts,
  getDashboardCounts,
  getOwnershipVerificationSetting,
  JOB_STATUSES,
  refreshJusoReferenceData,
  refreshKaptReferenceData,
  retryJob,
  revokeOwnership,
  updateOwnershipVerificationSetting,
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

// 운영자가 입력하는 사유. 비어 있으면 null, required면 필수.
const parseReason = (value, details, { required, requiredMessage = '사유를 입력해 주세요.' }) => {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    details.push({ field: 'reason', reason: '문자열이어야 합니다.' });
    return null;
  }
  const reason = value?.trim() || null;
  if (reason && reason.length > MAX_REASON_LENGTH) {
    details.push({ field: 'reason', reason: `${MAX_REASON_LENGTH}자 이하여야 합니다.` });
  }
  if (required && !reason) details.push({ field: 'reason', reason: requiredMessage });
  return reason;
};

const parseStatusBody = (body) => {
  assertAllowedBody(body, ['status', 'reason']);
  const details = [];
  const status = parseEnum(body.status, 'status', ADMIN_SETTABLE_STATUSES, details);
  if (body.status === undefined) details.push({ field: 'status', reason: '필수 값입니다.' });
  const reason = parseReason(body.reason, details, { required: status === 'SUSPENDED', requiredMessage: '정지 사유를 입력해 주세요.' });
  throwIfInvalid(details);
  return { status, reason };
};

// 소유 관계 철회·종료 본문 { reason }(필수).
const parseReasonBody = (body) => {
  const input = body ?? {};
  assertAllowedBody(input, ['reason']);
  const details = [];
  const reason = parseReason(input.reason, details, { required: true });
  throwIfInvalid(details);
  return { reason };
};

const parseOwnershipListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const verificationStatus = parseEnum(query.verificationStatus, 'verificationStatus', OWNERSHIP_FILTER_STATUSES, details);
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);
  return { verificationStatus, page, size };
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

// 커서 방식 목록의 cursor·size(api-contract.md 1장 "목록 조회").
const parseCursorPagination = (query, details) => {
  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeCreatedAtCursor(query.cursor);
    if (!cursor) details.push({ field: 'cursor', reason: '올바르지 않은 커서입니다.' });
  }

  let size = DEFAULT_CURSOR_SIZE;
  if (query.size !== undefined) {
    size = Number(query.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_CURSOR_SIZE) {
      details.push({ field: 'size', reason: `1 이상 ${MAX_CURSOR_SIZE} 이하의 정수여야 합니다.` });
    }
  }
  return { cursor, size };
};

const parseAuditLogQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  for (const field of ['actorId', 'resourceId']) {
    if (query[field] !== undefined && !isUuid(query[field])) details.push({ field, reason: 'UUID 형식이어야 합니다.' });
  }
  const from = parseDateTime(query.from, 'from', details);
  const to = parseDateTime(query.to, 'to', details);

  const { cursor, size } = parseCursorPagination(query, details);
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

const parseJobListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const status = parseEnum(query.status, 'status', JOB_STATUSES, details);
  const { cursor, size } = parseCursorPagination(query, details);
  throwIfInvalid(details);
  return { status, cursor, size };
};

// 문자열은 받지 않는다. 1 이상 정수, 날짜 계산이 깨지지 않는 상한까지.
export const parseVerificationSettingBody = (body) => {
  assertAllowedBody(body, ['validityYears']);
  const validityYears = typeof body.validityYears === 'number' ? parseValidityYears(body.validityYears) : null;
  if (validityYears === null) {
    throwIfInvalid([{ field: 'validityYears', reason: `1 이상 ${MAX_VALIDITY_YEARS} 이하의 정수여야 합니다.` }]);
  }
  return { validityYears };
};

const parseAttemptListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const status = parseEnum(query.status, 'status', ATTEMPT_STATUSES, details);
  const reasonCode = parseEnum(query.reasonCode, 'reasonCode', VERIFICATION_REASON_CODES, details);
  if (query.ownershipId !== undefined && !isUuid(query.ownershipId)) details.push({ field: 'ownershipId', reason: 'UUID 형식이어야 합니다.' });
  const { cursor, size } = parseCursorPagination(query, details);
  throwIfInvalid(details);
  return { status, reasonCode, ownershipId: query.ownershipId, cursor, size };
};

const throwUserNotFound = () => {
  throw new AppError('USER_NOT_FOUND', 404, '회원을 찾을 수 없습니다.');
};

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
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

// GET /api/v1/admin/property-ownerships?verificationStatus=&page=&size= — EXPIRED는 조회 시점 계산.
export const listOwnerships = async (req, res, next) => {
  try {
    const { items, meta } = await findAdminOwnerships(parseOwnershipListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/property-ownerships/:ownershipId/revoke — { reason }
export const postOwnershipRevoke = async (req, res, next) => {
  try {
    const { ownershipId } = req.params;
    if (!isUuid(ownershipId)) throwOwnershipNotFound();
    sendData(res, await revokeOwnership(req.user, ownershipId, parseReasonBody(req.body), req));
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/property-ownerships/:ownershipId/end — { reason }. 계약이 있어도 종료한다(ADMIN_ENDED).
export const postOwnershipEnd = async (req, res, next) => {
  try {
    const { ownershipId } = req.params;
    if (!isUuid(ownershipId)) throwOwnershipNotFound();
    sendData(res, await endOwnershipByAdmin(req.user, ownershipId, parseReasonBody(req.body), req));
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/jobs?status=&size=&cursor= — 최근 순 커서 방식.
export const listJobs = async (req, res, next) => {
  try {
    const { items, meta } = await findAdminJobs(parseJobListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/jobs/:jobId/retry — FAILED만 PENDING으로 되돌린다(202, 본문 없음).
export const postJobRetry = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!isUuid(jobId)) throw new AppError('JOB_NOT_FOUND', 404, '작업을 찾을 수 없습니다.');
    assertAllowedBody(req.body ?? {}, []);
    sendData(res, await retryJob(req.user, jobId, req), { status: 202 });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/settings/ownership-verification
export const getVerificationSetting = async (req, res, next) => {
  try {
    sendData(res, await getOwnershipVerificationSetting());
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/settings/ownership-verification — { validityYears }
export const patchVerificationSetting = async (req, res, next) => {
  try {
    sendData(res, await updateOwnershipVerificationSetting(req.user, parseVerificationSettingBody(req.body), req));
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/ownership-verification-attempts?status=&reasonCode=&ownershipId=&cursor=&size=
export const listVerificationAttempts = async (req, res, next) => {
  try {
    const { items, meta } = await findOwnershipVerificationAttempts(parseAttemptListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/complexes — { name, jibunAddress, roadAddress, legalDongCode, sourceKey }
export const postComplex = async (req, res, next) => {
  try {
    sendData(res, await createComplex(req.user, parseComplexBody(req.body), req), { status: 201 });
  } catch (error) {
    next(error);
  }
};
