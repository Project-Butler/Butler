// 하우스 로그(계약 5장). 쓰기는 소유 관계 행을 잠근 트랜잭션 안에서 한다(platform/ownershipLock.js).
import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow, toDateOnlyString } from '../../platform/dateUtils.js';
import {
  assertDocumentsDeletable,
  attachDocumentsInTx,
  findAttachedDocuments,
  MANAGEMENT_LOG_RESOURCE,
  softDeleteDocumentsInTx,
  withAttachments,
} from '../../platform/documentAttachments.js';
import {
  canDeleteLog,
  canEditLog,
  isHideOnlyLog,
  isOwnershipVerified,
  PROPERTY_HISTORY_ONLY_TYPES,
  resolveCreateScope,
  toVisibleLogWhere,
} from '../../platform/managementLogRules.js';
import { MANAGEMENT_LOG_INCLUDE, toManagementLogResponse } from '../../platform/managementLogSerializer.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';
import { insertPropertyLog, toDbDate } from '../../platform/propertyHistory.js';
import { toRoomWhere } from '../../platform/roomRules.js';
import { removeStoredObjects } from '../documents/storage/index.js';
import { keywordsWhere, splitQuery } from '../search/searchQuery.js';

// 감사 로그 summary에 쓰는 칸 이름(값은 넣지 않는다, 명세 D-04)
const FIELD_LABELS = {
  type: '유형',
  title: '제목',
  content: '내용',
  occurredOn: '날짜',
  cost: '비용',
  room: '방',
  attachments: '첨부',
};

const isSameFieldValue = (log, field, value) =>
  field === 'occurredOn' ? toDateOnlyString(log.occurredOn) === value : log[field] === value;

const throwPropertyNotFound = () => {
  throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');
};

const throwLogNotFound = () => {
  throw new AppError('MANAGEMENT_LOG_NOT_FOUND', 404, '하우스 로그를 찾을 수 없습니다.');
};

const throwVerificationRequired = () => {
  throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증 후 호실 이력을 쓸 수 있어요.');
};

// 인증된 소유자의 수리·점검은 호실 이력으로만 남는다(H-29). field: 화면이 오류를 붙일 칸.
const throwScopeNotAllowed = (field, reason) => {
  throw new AppError('SCOPE_NOT_ALLOWED', 400, '수리·점검 기록은 집 이력으로 남아요. 나만 보기로 둘 수 없습니다.', [{ field, reason }]);
};

const recordLogActivity = (tx, user, type, log, extra = {}) =>
  recordActivity(tx, {
    userId: user.id,
    type,
    complexId: log.property.complexId,
    propertyId: log.propertyId,
    params: { buildingNo: log.property.buildingNo, unitNo: log.property.unitNo, title: log.title, type: log.type, ...extra },
  });

// removedAt([목록에서 지우기])도 읽는다 — toVisibleLogWhere가 지운 소유 관계의 기록을 뺀다.
const findUserOwnerships = (user) => prisma.ownership.findMany({ where: { userId: user.id } });

// 검색 칸. 통합 검색(domains/search)의 하우스 로그 검색과 같다.
const LOG_SEARCH_FIELDS = ['title', 'content'];

// from·until(그날 포함)은 한 occurredOn 객체로 합친다(따로 펼치면 키가 겹쳐 한쪽이 사라진다).
const toOccurredOnWhere = (from, until) => {
  if (!from && !until) return {};
  return { occurredOn: { ...(from ? { gte: toDbDate(from) } : {}), ...(until ? { lte: toDbDate(until) } : {}) } };
};

const buildFilters = ({ propertyId, scope, types, rooms, q, from, until }) => ({
  AND: [
    {
      ...(propertyId ? { propertyId } : {}),
      ...(scope ? { scope } : {}),
      ...(types?.length > 0 ? { type: { in: types } } : {}),
      ...toOccurredOnWhere(from, until),
    },
    toRoomWhere(rooms),
    q ? keywordsWhere(splitQuery(q), LOG_SEARCH_FIELDS) : {},
  ],
});

const findPage = async (user, ownerships, filters, { sortDirection, page, size }) => {
  const now = getNow();
  const where = { AND: [toVisibleLogWhere(user, ownerships, now), buildFilters(filters)] };
  const [total, rows] = await Promise.all([
    prisma.propertyLog.count({ where }),
    prisma.propertyLog.findMany({
      where,
      include: MANAGEMENT_LOG_INCLUDE,
      orderBy: [{ occurredOn: sortDirection }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);
  const logs = await withAttachments(prisma, MANAGEMENT_LOG_RESOURCE, rows);
  return {
    items: logs.map((log) => toManagementLogResponse(log, user, now)),
    meta: { page, size, total, hasNext: page * size < total },
  };
};

const attachLogDocuments = (tx, user, logId, documentIds) =>
  attachDocumentsInTx(tx, user, { resourceType: MANAGEMENT_LOG_RESOURCE, resourceId: logId, documentIds, now: getNow() });

// 기록을 쓸 소유 관계를 잠가서 돌려준다. 활성 소유 관계가 없으면 매도 뒤 판 사람의 쓰기(H-41):
// 인증한 적 있고 매도(SOLD)로 끝났고 목록에서 지우지 않은 가장 최근 소유 관계. 그 밖(SUPERSEDED 등)은 404.
const lockCreatableOwnership = async (tx, user, propertyId) => {
  const active = await tx.ownership.findFirst({ where: { userId: user.id, propertyId, endedAt: null }, select: { id: true } });
  if (active) {
    const ownership = await lockOwnershipRow(tx, active.id);
    if (!ownership.endedAt) return { ownership, afterSale: false };
  }
  const sold = await tx.ownership.findFirst({
    where: { userId: user.id, propertyId, endReason: 'SOLD', firstVerifiedAt: { not: null }, removedAt: null },
    orderBy: [{ endedAt: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (!sold) throwPropertyNotFound();
  const ownership = await lockOwnershipRow(tx, sold.id);
  // 잠금을 기다리는 사이 목록에서 지웠을 수 있다.
  if (ownership.removedAt) throwPropertyNotFound();
  return { ownership, afterSale: true };
};

// 매도 뒤 새 기록은 나만 보기로만 남는다(H-41). 호실 이력은 다음 소유자 것이라 요청하면 400.
const resolveAfterSaleScope = (requestedScope) => {
  if (requestedScope === 'PROPERTY_HISTORY') throwScopeNotAllowed('scope', '매도한 호실에는 나만 보기 기록만 남길 수 있어요.');
  return { scope: 'PRIVATE', keepPrivate: true };
};

// POST /properties/:propertyId/management-logs
// 사진은 먼저 미연결 문서로 올리고(POST /documents) 그 id를 attachmentDocumentIds로 넘긴다. 같은 트랜잭션에서 붙인다.
// 공개 범위는 서버가 정한다(resolveCreateScope, H-29·H-45): 인증 전엔 모두 나만 보기, 인증 뒤 수리·점검은 호실 이력.
// 매도 뒤 판 사람은 끝난 소유 관계에 나만 보기로 쓴다(H-41).
export const createManagementLog = async (user, propertyId, { attachmentDocumentIds = [], scope: requestedScope = null, keepPrivate = false, ...input }) => {
  const created = await prisma.$transaction(async (tx) => {
    const { ownership, afterSale } = await lockCreatableOwnership(tx, user, propertyId);
    const resolved = afterSale
      ? resolveAfterSaleScope(requestedScope)
      : resolveCreateScope({ type: input.type, keepPrivate, requestedScope, verified: isOwnershipVerified(ownership) });
    if (resolved.error === 'VERIFICATION_REQUIRED') throwVerificationRequired();
    if (resolved.error === 'SCOPE_NOT_ALLOWED') throwScopeNotAllowed('scope', '수리·점검은 집 이력으로 남아요.');
    if (resolved.error) {
      throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
        { field: 'keepPrivate', reason: '나만 보기와 호실 이력(PROPERTY_HISTORY)을 함께 고를 수 없습니다.' },
      ]);
    }

    const log = await insertPropertyLog(tx, {
      ...input,
      scope: resolved.scope,
      keepPrivate: resolved.keepPrivate,
      propertyId,
      ownershipId: ownership.id,
      authorId: user.id,
      include: MANAGEMENT_LOG_INCLUDE,
    });
    await attachLogDocuments(tx, user, log.id, attachmentDocumentIds);
    await recordLogActivity(tx, user, ACTIVITY_TYPES.MANAGEMENT_LOG_CREATED, log);
    const [withDocuments] = await withAttachments(tx, MANAGEMENT_LOG_RESOURCE, [log]);
    return withDocuments;
  });
  return toManagementLogResponse(created, user, getNow());
};

// GET /properties/:propertyId/management-logs — 활성·이전 소유자, 운영자. 그 밖에는 호실을 숨긴다.
export const findPropertyManagementLogs = async (user, propertyId, query) => {
  const ownerships = await findUserOwnerships(user);
  // 목록에서 지운 소유 관계만 있는 호실은 관계없는 호실로 본다.
  const isRelated = ownerships.some((ownership) => ownership.propertyId === propertyId && !ownership.removedAt);
  if (!isRelated) {
    if (user.role !== 'ADMIN') throwPropertyNotFound();
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!property) throwPropertyNotFound();
  }
  return findPage(user, ownerships, { ...query, propertyId }, query);
};

// GET /management-logs — 내가 소유했던 모든 호실.
export const findManagementLogs = async (user, query) => findPage(user, await findUserOwnerships(user), query, query);

// GET /management-logs/:logId — 볼 수 없으면 null(컨트롤러가 404).
export const findManagementLogForUser = async (user, logId) => {
  const now = getNow();
  const ownerships = await findUserOwnerships(user);
  const log = await prisma.propertyLog.findFirst({
    where: { AND: [{ id: logId }, toVisibleLogWhere(user, ownerships, now)] },
    include: MANAGEMENT_LOG_INCLUDE,
  });
  if (!log) return null;
  const [withDocuments] = await withAttachments(prisma, MANAGEMENT_LOG_RESOURCE, [log]);
  return toManagementLogResponse(withDocuments, user, now);
};

// 쓰기 공통: 기록을 찾고 그 소유 관계를 잠근 뒤 다시 읽는다.
// 내 소유 관계의 기록(시스템 기록 포함)이 아니거나 목록에서 지운 소유 관계의 기록이면 404로 숨긴다.
const lockLogForWriter = async (tx, user, logId) => {
  const found = await tx.propertyLog.findUnique({ where: { id: logId }, select: { ownershipId: true } });
  if (!found) throwLogNotFound();
  const ownership = await lockOwnershipRow(tx, found.ownershipId);
  if (ownership.userId !== user.id || ownership.removedAt) throwLogNotFound();
  // 잠금을 기다리는 사이 다른 요청이 지웠을 수 있다.
  const log = await tx.propertyLog.findUnique({ where: { id: logId }, include: MANAGEMENT_LOG_INCLUDE });
  if (!log) throwLogNotFound();
  return log;
};

const throwLogReadOnly = () => {
  throw new AppError('MANAGEMENT_LOG_READ_ONLY', 422, '다음 소유자에게 넘어간 호실 이력이나 시스템이 만든 기록은 수정할 수 없습니다.');
};

// 수정(첨부 추가·삭제 포함)할 수 있는 기록을 잠가서 돌려준다. 문서 API도 같은 규칙을 쓴다(documents/resourcePolicies.js).
export const lockWritableLog = async (tx, user, logId) => {
  const log = await lockLogForWriter(tx, user, logId);
  if (!canEditLog(log, user, getNow())) {
    // 활성 소유 관계 본인인데 못 고치는 경우는 인증이 끊긴 것뿐이다(D-16, H-47 — 작성자 여부와 상관없이 403).
    if (!log.ownership.endedAt) throwVerificationRequired();
    throwLogReadOnly();
  }
  return log;
};

// 유형 바꾸기로 공개 범위 규칙을 피하지 못하게 한다. 수리 요청 완료 요약의 유형은 바꿀 수 없다.
const assertTypeChangeAllowed = (log, type) => {
  if (type === undefined || type === log.type) return;
  if (log.type === 'TICKET_SUMMARY') {
    throw new AppError('VALIDATION_ERROR', 400, '수리 요청 완료 기록의 유형은 바꿀 수 없습니다.', [
      { field: 'type', reason: 'TICKET_SUMMARY는 바꿀 수 없습니다.' },
    ]);
  }
  if (log.scope === 'PRIVATE' && PROPERTY_HISTORY_ONLY_TYPES.includes(type) && isOwnershipVerified(log.ownership, getNow())) {
    throwScopeNotAllowed('type', '나만 보기 기록은 수리·점검으로 바꿀 수 없어요.');
  }
};

// 기록을 볼 수 있는지(문서 조회 권한). 목록·상세와 같은 범위다.
export const canViewManagementLog = async (user, logId) => {
  const ownerships = await findUserOwnerships(user);
  const log = await prisma.propertyLog.findFirst({
    where: { AND: [{ id: logId }, toVisibleLogWhere(user, ownerships, getNow())] },
    select: { id: true },
  });
  return Boolean(log);
};

// 첨부 목록을 attachmentDocumentIds(최종 목록)로 맞춘다. 빠진 문서는 숨기고(잠긴 문서는 422), 새 문서는 붙인다.
// 바뀌었으면 지울 파일 경로와 함께 changed: true.
const syncLogAttachments = async (tx, user, log, attachmentDocumentIds) => {
  const current = await findAttachedDocuments(tx, MANAGEMENT_LOG_RESOURCE, log.id);
  const currentIds = current.map((document) => document.id);
  const removed = current.filter((document) => !attachmentDocumentIds.includes(document.id));
  const added = attachmentDocumentIds.filter((id) => !currentIds.includes(id));
  assertDocumentsDeletable(removed, user);
  const removedPaths = await softDeleteDocumentsInTx(tx, removed, getNow());
  await attachLogDocuments(tx, user, log.id, added);
  return { changed: removed.length + added.length > 0, removedPaths };
};

// PATCH /management-logs/:logId — data는 컨트롤러가 검증한 값(보낸 칸만). attachmentDocumentIds는 첨부의 최종 목록.
export const updateManagementLog = async (user, logId, { attachmentDocumentIds, ...data }, req) => {
  let removedPaths = [];
  const updated = await prisma.$transaction(async (tx) => {
    const log = await lockWritableLog(tx, user, logId);
    assertTypeChangeAllowed(log, data.type);

    // 화면은 칸을 전부 보내므로 실제로 바뀐 칸만 고르고 기록한다. 바뀐 게 없으면 활동·감사도 남기지 않는다.
    const fields = Object.keys(data).filter((field) => !isSameFieldValue(log, field, data[field]));
    if (attachmentDocumentIds) {
      const synced = await syncLogAttachments(tx, user, log, attachmentDocumentIds);
      removedPaths = synced.removedPaths;
      if (synced.changed) fields.push('attachments');
    }
    if (fields.length === 0) return log;

    const row = await tx.propertyLog.update({
      where: { id: log.id },
      // 첨부만 바뀌어도 수정 시각은 바뀐다.
      data: { ...data, ...(data.occurredOn ? { occurredOn: toDbDate(data.occurredOn) } : {}), updatedAt: getNow() },
      include: MANAGEMENT_LOG_INCLUDE,
    });
    await recordLogActivity(tx, user, ACTIVITY_TYPES.MANAGEMENT_LOG_UPDATED, row, { fields });
    if (row.scope === 'PROPERTY_HISTORY') {
      await audit.record({
        actor: user,
        action: 'MANAGEMENT_LOG_UPDATED',
        resourceType: 'MANAGEMENT_LOG',
        resourceId: row.id,
        summary: `하우스 로그 수정: ${fields.map((field) => FIELD_LABELS[field]).join(', ')}`,
        req,
        client: tx,
      });
    }
    return row;
  });
  await removeStoredObjects(removedPaths);
  const [withDocuments] = await withAttachments(prisma, MANAGEMENT_LOG_RESOURCE, [updated]);
  return toManagementLogResponse(withDocuments, user, getNow());
};

// DELETE /management-logs/:logId — 규칙은 canDeleteLog(H-36·H-47·H-41). 작성자는 인증 상태면 호실 이력도 지우고,
// 소유가 끝난 뒤에도 나만 보기 기록은 지울 수 있다(D-13). 수리 요청 완료 요약은 인증된 활성 소유자가 지운다.
// 소유가 끝난 판 사람의 호실 이력·요약은 지우지 않고 숨긴다(내 화면에서만, 이미 숨겼어도 204).
// 활성 소유 관계 본인인데 못 지우면 인증이 끊긴 것이라 403, 끝난 소유 관계는 422. 붙은 문서도 숨기고 파일을 지운다.
export const deleteManagementLog = async (user, logId) => {
  const removedPaths = await prisma.$transaction(async (tx) => {
    const log = await lockLogForWriter(tx, user, logId);
    if (isHideOnlyLog(log, user)) {
      await tx.propertyLogHide.createMany({ data: [{ userId: user.id, logId: log.id, ownershipId: log.ownershipId }], skipDuplicates: true });
      return [];
    }
    if (!canDeleteLog(log, user, getNow())) {
      if (!log.ownership.endedAt) throwVerificationRequired();
      throw new AppError('MANAGEMENT_LOG_NOT_DELETABLE', 422, '소유가 끝난 호실의 호실 이력과 시스템이 만든 기록은 삭제할 수 없습니다.');
    }
    await recordLogActivity(tx, user, ACTIVITY_TYPES.MANAGEMENT_LOG_DELETED, log);
    // 지워지는 기록을 가리키는 티켓이 있으면 DB가 log_id를 비운다(ON DELETE SET NULL).
    const documents = await findAttachedDocuments(tx, MANAGEMENT_LOG_RESOURCE, log.id);
    const paths = await softDeleteDocumentsInTx(tx, documents, getNow());
    await tx.propertyLog.delete({ where: { id: log.id } });
    return paths;
  });
  await removeStoredObjects(removedPaths);
};

// ── 인증 뒤 올리기(H-44) ──
// 처음 인증하기 전에 쓴 나만 보기 기록 중 수리·점검과 [나만 보기]를 고르지 않은 메모를 호실 이력으로 한 번에 올린다.
// 소유 관계당 한 번(logsPromotedAt). 인증이 끊긴 동안 쓴 기록은 firstVerifiedAt 뒤라 대상이 아니다.
const PROMOTE_TARGET_LIMIT = 100;

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

// 그 소유 관계의 인증된 활성 소유자만. 남의 소유 관계는 404, 끝났으면 422, 인증 상태가 아니면 403.
const assertPromotableOwnership = (ownership, user) => {
  if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();
  if (ownership.endedAt) throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
  if (!isOwnershipVerified(ownership, getNow())) {
    throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증 후 호실 이력으로 올릴 수 있어요.');
  }
};

const toPromoteTargetWhere = (ownership) => ({
  ownershipId: ownership.id,
  scope: 'PRIVATE',
  createdAt: { lt: ownership.firstVerifiedAt },
  OR: [{ type: { in: PROPERTY_HISTORY_ONLY_TYPES } }, { type: 'NOTE', keepPrivate: false }],
});

// GET /property-ownerships/:ownershipId/management-logs/promote-preview — 이미 처리했으면 count 0.
// items는 날짜 최근 순 최대 100건(count는 전체).
export const findPromotePreview = async (user, ownershipId) => {
  const ownership = await prisma.ownership.findUnique({ where: { id: ownershipId } });
  assertPromotableOwnership(ownership, user);
  if (ownership.logsPromotedAt || !ownership.firstVerifiedAt) return { count: 0, items: [] };
  const where = toPromoteTargetWhere(ownership);
  const [count, rows] = await Promise.all([
    prisma.propertyLog.count({ where }),
    prisma.propertyLog.findMany({
      where,
      select: { id: true, title: true, type: true, occurredOn: true },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: PROMOTE_TARGET_LIMIT,
    }),
  ]);
  return { count, items: rows.map((row) => ({ ...row, occurredOn: toDateOnlyString(row.occurredOn) })) };
};

// POST /property-ownerships/:ownershipId/management-logs/promote — skip: true면 올리지 않고 처리한 것으로만 남긴다.
export const promoteUnverifiedLogs = (user, ownershipId, { skip = false }) =>
  prisma.$transaction(async (tx) => {
    const ownership = await lockOwnershipRow(tx, ownershipId);
    assertPromotableOwnership(ownership, user);
    if (ownership.logsPromotedAt) throw new AppError('ALREADY_PROMOTED', 409, '이미 처리했어요.');

    const now = getNow();
    let promotedCount = 0;
    if (!skip && ownership.firstVerifiedAt) {
      const { count } = await tx.propertyLog.updateMany({
        where: toPromoteTargetWhere(ownership),
        data: { scope: 'PROPERTY_HISTORY', updatedAt: now },
      });
      promotedCount = count;
    }
    await tx.ownership.update({ where: { id: ownership.id }, data: { logsPromotedAt: now } });
    return { promotedCount };
  });
