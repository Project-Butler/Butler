// 관리 로그(계약 5장). 쓰기는 소유 관계 행을 잠근 트랜잭션 안에서 한다(platform/ownershipLock.js).
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
import { canEditLog, isOwnershipVerified, toVisibleLogWhere } from '../../platform/managementLogRules.js';
import { MANAGEMENT_LOG_INCLUDE, toManagementLogResponse } from '../../platform/managementLogSerializer.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';
import { insertPropertyLog, toDbDate } from '../../platform/propertyHistory.js';
import { removeStoredObjects } from '../documents/storage/index.js';

// 감사 로그 summary에 쓰는 칸 이름(값은 넣지 않는다, 명세 D-04)
const FIELD_LABELS = { type: '유형', title: '제목', content: '내용', occurredOn: '날짜', cost: '비용', attachments: '첨부' };

const isSameFieldValue = (log, field, value) =>
  field === 'occurredOn' ? toDateOnlyString(log.occurredOn) === value : log[field] === value;

const throwPropertyNotFound = () => {
  throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');
};

const throwLogNotFound = () => {
  throw new AppError('MANAGEMENT_LOG_NOT_FOUND', 404, '관리 로그를 찾을 수 없습니다.');
};

const throwVerificationRequired = () => {
  throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증 후 호실 이력을 쓸 수 있어요.');
};

const recordLogActivity = (tx, user, type, log, extra = {}) =>
  recordActivity(tx, {
    userId: user.id,
    type,
    complexId: log.property.complexId,
    propertyId: log.propertyId,
    params: { buildingNo: log.property.buildingNo, unitNo: log.property.unitNo, title: log.title, type: log.type, ...extra },
  });

const findUserOwnerships = (user) => prisma.ownership.findMany({ where: { userId: user.id } });

const buildFilters = ({ propertyId, scope, types, until }) => ({
  ...(propertyId ? { propertyId } : {}),
  ...(scope ? { scope } : {}),
  ...(types?.length > 0 ? { type: { in: types } } : {}),
  ...(until ? { occurredOn: { lte: toDbDate(until) } } : {}),
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

// POST /properties/:propertyId/management-logs
// 사진은 먼저 미연결 문서로 올리고(POST /documents) 그 id를 attachmentDocumentIds로 넘긴다. 같은 트랜잭션에서 붙인다.
export const createManagementLog = async (user, propertyId, { attachmentDocumentIds = [], ...input }) => {
  const created = await prisma.$transaction(async (tx) => {
    const active = await tx.ownership.findFirst({ where: { userId: user.id, propertyId, endedAt: null }, select: { id: true } });
    if (!active) throwPropertyNotFound();
    const ownership = await lockOwnershipRow(tx, active.id);
    if (ownership.endedAt) throwPropertyNotFound();
    if (input.scope === 'PROPERTY_HISTORY' && !isOwnershipVerified(ownership)) throwVerificationRequired();

    const log = await insertPropertyLog(tx, {
      ...input,
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
  const isRelated = ownerships.some((ownership) => ownership.propertyId === propertyId);
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
// 내 소유 관계의 기록(시스템 기록 포함)이 아니고 내가 쓴 것도 아니면 404로 숨긴다.
const lockLogForWriter = async (tx, user, logId) => {
  const found = await tx.propertyLog.findUnique({ where: { id: logId }, select: { ownershipId: true } });
  if (!found) throwLogNotFound();
  const ownership = await lockOwnershipRow(tx, found.ownershipId);
  if (ownership.userId !== user.id) throwLogNotFound();
  // 잠금을 기다리는 사이 다른 요청이 지웠을 수 있다.
  const log = await tx.propertyLog.findUnique({ where: { id: logId }, include: MANAGEMENT_LOG_INCLUDE });
  if (!log) throwLogNotFound();
  return log;
};

const throwLogReadOnly = () => {
  throw new AppError('MANAGEMENT_LOG_READ_ONLY', 422, '소유가 끝난 호실의 기록이나 시스템이 만든 기록은 수정할 수 없습니다.');
};

// 수정(첨부 추가·삭제 포함)할 수 있는 기록을 잠가서 돌려준다. 문서 API도 같은 규칙을 쓴다(documents/resourcePolicies.js).
export const lockWritableLog = async (tx, user, logId) => {
  const log = await lockLogForWriter(tx, user, logId);
  if (!canEditLog(log, user, getNow())) {
    // 활성 소유자 본인이 쓴 호실 이력인데 수정 못 하는 경우는 인증이 끊긴 것뿐이다(D-16).
    if (log.authorId === user.id && !log.ownership.endedAt) throwVerificationRequired();
    throwLogReadOnly();
  }
  return log;
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
        summary: `관리 기록 수정: ${fields.map((field) => FIELD_LABELS[field]).join(', ')}`,
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

// DELETE /management-logs/:logId — 작성자면 소유가 끝난 뒤에도 지울 수 있다(D-13). 호실 이력과 시스템 기록은 못 지운다.
// 붙은 문서도 숨기고 파일을 지운다.
export const deleteManagementLog = async (user, logId) => {
  const removedPaths = await prisma.$transaction(async (tx) => {
    const log = await lockLogForWriter(tx, user, logId);
    if (log.scope === 'PROPERTY_HISTORY' || log.authorId !== user.id) {
      throw new AppError('MANAGEMENT_LOG_NOT_DELETABLE', 422, '호실 이력과 시스템이 만든 기록은 삭제할 수 없습니다.');
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
