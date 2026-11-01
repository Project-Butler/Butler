import { Prisma } from '@prisma/client';
import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow, getTodayKST } from '../../platform/dateUtils.js';
import { afterCreatedAtCursor, toCursorPage } from '../../platform/createdAtCursor.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { formatDisplayName } from '../../platform/unitAddress.js';
import { runKaptBasisRefreshNow } from '../../referenceData/kaptExcelRefresh.js';
import { ImportAlreadyRunningError } from '../../referenceData/referenceImports.js';
import { revokeAllSessions, toPublicUser } from '../auth/service.js';
import { JusoRefreshBusyError, runJusoRefreshNow } from '../cron/referenceData.js';
import { toJobResponse } from '../jobs/service.js';
import { endOwnershipInTx, toResponse as toOwnershipResponse } from '../propertyOwnerships/service.js';
import { splitExpiredOwnerships, sumCounts, toCountMap } from './dashboardCounts.js';
import { toVerificationStatusWhere } from './ownershipFilter.js';
import { assertUserStatusChangeAllowed } from './userStatusChange.js';

const toRefreshBusyError = () => new AppError('REFERENCE_DATA_REFRESH_IN_PROGRESS', 409, '이미 갱신 중입니다. 잠시 뒤 다시 시도해 주세요.');

// juso 참고 데이터 즉시 갱신. 공식 연계 API로 밀린 날짜를 적용하고 결과 요약을 돌려준다.
// 실행 기록은 jobs(JUSO_REFRESH_MANUAL). 이미 갱신 중이면 409.
export const refreshJusoReferenceData = async (user) => {
  try {
    return await runJusoRefreshNow({ prisma, requestedBy: user.id });
  } catch (error) {
    if (error instanceof JusoRefreshBusyError) throw toRefreshBusyError();
    throw error;
  }
};

// K-apt 기본정보 엑셀 즉시 갱신. 이미 넣은 날짜면 받지 않고 끝난다. 실행 기록은 jobs(KAPT_BASIS_REFRESH_MANUAL). 이미 갱신 중이면 409.
export const refreshKaptReferenceData = async (user) => {
  try {
    return await runKaptBasisRefreshNow({ prisma, requestedBy: user.id });
  } catch (error) {
    if (error instanceof ImportAlreadyRunningError) throw toRefreshBusyError();
    throw error;
  }
};

export const USER_ROLES = ['LANDLORD', 'TENANT', 'ADMIN'];
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'WITHDRAWN'];
const STORED_VERIFICATION_STATUSES = ['UNVERIFIED', 'VERIFIED', 'REVOKED'];
const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'];
export const JOB_STATUSES = ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'];

// GET /admin/dashboard 요약 카운트. 소유 관계는 활성(endedAt null)만 센다.
// 계약 active는 contractStatus.js의 ACTIVE·EXPIRING_SOON과 같은 범위(해지 안 됨 + 시작일 ≤ 오늘(KST) ≤ 종료일)다.
export const getDashboardCounts = async () => {
  const now = getNow();
  const today = new Date(`${getTodayKST()}T00:00:00Z`);
  const [usersByRole, usersByStatus, ownershipsByStatus, expiredOwnerships, contractTotal, activeContracts, ticketsByStatus, jobsByStatus] =
    await prisma.$transaction([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true }, orderBy: { role: 'asc' } }),
      prisma.user.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.ownership.groupBy({
        by: ['verificationStatus'],
        where: { endedAt: null },
        _count: { _all: true },
        orderBy: { verificationStatus: 'asc' },
      }),
      prisma.ownership.count({ where: { endedAt: null, verificationStatus: 'VERIFIED', verificationExpiresAt: { lt: now } } }),
      prisma.contract.count(),
      prisma.contract.count({ where: { terminatedOn: null, startDate: { lte: today }, endDate: { gte: today } } }),
      prisma.ticket.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.job.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);

  const byRole = toCountMap(usersByRole, 'role', USER_ROLES);
  const ownershipCounts = toCountMap(ownershipsByStatus, 'verificationStatus', STORED_VERIFICATION_STATUSES);
  return {
    users: { total: sumCounts(byRole), byRole, byStatus: toCountMap(usersByStatus, 'status', USER_STATUSES) },
    ownerships: {
      active: sumCounts(ownershipCounts),
      byVerificationStatus: splitExpiredOwnerships(ownershipCounts, expiredOwnerships),
    },
    contracts: { total: contractTotal, active: activeContracts },
    tickets: { byStatus: toCountMap(ticketsByStatus, 'status', TICKET_STATUSES) },
    jobs: { byStatus: toCountMap(jobsByStatus, 'status', JOB_STATUSES) },
  };
};

const toAdminUser = (user) => ({
  ...toPublicUser(user),
  suspendedAt: user.suspendedAt?.toISOString() ?? null,
  suspendReason: user.suspendReason,
  withdrawnAt: user.withdrawnAt?.toISOString() ?? null,
});

const toPageMeta = (page, size, total) => ({ page, size, total, hasNext: page * size < total });

// GET /admin/users. query는 이메일·이름 부분 일치(대소문자 무시), 최근 가입 순.
export const findAdminUsers = async ({ query, role, status, page, size }) => {
  const where = {
    ...(query && {
      OR: [{ email: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }],
    }),
    ...(role && { role }),
    ...(status && { status }),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * size, take: size }),
    prisma.user.count({ where }),
  ]);
  return { items: users.map(toAdminUser), meta: toPageMeta(page, size, total) };
};

const toOwnershipSummary = (ownership, now) => ({
  id: ownership.id,
  propertyId: ownership.propertyId,
  complexId: ownership.property.complexId,
  displayName: formatDisplayName(ownership.property.complex.name, ownership.property.buildingNo, ownership.property.unitNo),
  verificationStatus: computeOwnershipVerificationStatus(ownership, now),
  isActive: ownership.endedAt === null,
  startedAt: ownership.startedAt.toISOString(),
  endedAt: ownership.endedAt?.toISOString() ?? null,
  endReason: ownership.endReason,
});

// GET /admin/users/:userId. 없으면 null. 소유 관계는 활성 먼저, 그 안에서는 최근 시작 순.
export const findAdminUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      ownerships: {
        include: { property: { include: { complex: { select: { name: true } } } } },
        orderBy: { startedAt: 'desc' },
      },
    },
  });
  if (!user) return null;

  const now = getNow();
  const ownerships = user.ownerships.map((ownership) => toOwnershipSummary(ownership, now));
  return {
    ...toAdminUser(user),
    ownerships: [...ownerships.filter((item) => item.isActive), ...ownerships.filter((item) => !item.isActive)],
  };
};

// PATCH /admin/users/:userId/status. 정지하면 그 사용자의 모든 세션을 폐기한다(api-contract.md 8장).
// 상태 변경·세션 폐기·감사 로그를 한 트랜잭션으로 묶는다. 같은 상태로 바꾸면 아무것도 하지 않는다.
export const changeUserStatus = (actor, userId, { status, reason }, req) =>
  prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) throw new AppError('USER_NOT_FOUND', 404, '회원을 찾을 수 없습니다.');
    assertUserStatusChangeAllowed(actor, target);
    if (target.status === status) return toAdminUser(target);

    const isSuspending = status === 'SUSPENDED';
    const updated = await tx.user.update({
      where: { id: userId },
      data: { status, suspendedAt: isSuspending ? getNow() : null, suspendReason: isSuspending ? reason : null },
    });
    if (isSuspending) await revokeAllSessions(userId, tx);
    await audit.record({
      actor,
      action: 'USER_STATUS_CHANGED',
      resourceType: 'USER',
      resourceId: userId,
      summary: `${target.status} → ${status}`,
      before: { status: target.status },
      after: { status, reason: reason ?? null },
      req,
      client: tx,
    });
    return toAdminUser(updated);
  });

const toAuditLogResponse = (log) => ({
  id: log.id,
  actorType: log.actorType,
  actorId: log.actorId,
  action: log.action,
  resourceType: log.resourceType,
  resourceId: log.resourceId,
  summary: log.summary,
  before: log.before,
  after: log.after,
  requestId: log.requestId,
  ip: log.ip,
  createdAt: log.createdAt.toISOString(),
});

// GET /admin/audit-logs. 최근 순 커서 방식이라 size + 1건을 읽어 다음 쪽이 있는지 본다.
export const findAuditLogs = async ({ actorId, action, resourceType, resourceId, from, to, cursor, size }) => {
  const where = {
    ...(actorId && { actorId }),
    ...(action && { action }),
    ...(resourceType && { resourceType }),
    ...(resourceId && { resourceId }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
    ...afterCreatedAtCursor(cursor),
  };
  const logs = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: size + 1 });
  const { items, meta } = toCursorPage(logs, size);
  return { items: items.map(toAuditLogResponse), meta };
};

const OWNERSHIP_INCLUDE = {
  property: { include: { complex: true } },
  user: { select: { id: true, name: true, email: true } },
};

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

// PropertyOwnership 전체 + 소유자(owner). 관리자 화면이 소유자 이름·이메일을 같이 보여 준다.
const toAdminOwnership = (ownership, now) => ({ ...toOwnershipResponse(ownership, now), owner: ownership.user });

// GET /admin/property-ownerships. 활성·종료 전부, 시작일 최신순. EXPIRED 필터는 ownershipFilter.js가 나눈다.
export const findAdminOwnerships = async ({ verificationStatus, page, size }) => {
  const now = getNow();
  const where = toVerificationStatusWhere(verificationStatus, now);
  const [ownerships, total] = await prisma.$transaction([
    prisma.ownership.findMany({
      where,
      include: OWNERSHIP_INCLUDE,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.ownership.count({ where }),
  ]);
  return { items: ownerships.map((ownership) => toAdminOwnership(ownership, now)), meta: toPageMeta(page, size, total) };
};

// POST /admin/property-ownerships/:ownershipId/revoke. 활성 소유 관계만, 이미 REVOKED면 아무것도 하지 않는다.
// 상태 변경과 감사 로그(OWNERSHIP_REVOKED_BY_ADMIN)를 한 트랜잭션으로 묶는다.
export const revokeOwnership = (actor, ownershipId, { reason }, req) =>
  prisma.$transaction(async (tx) => {
    const ownership = await tx.ownership.findUnique({ where: { id: ownershipId } });
    if (!ownership) throwOwnershipNotFound();
    if (ownership.endedAt) throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');

    if (ownership.verificationStatus !== 'REVOKED') {
      // 동시에 철회해도 감사 로그가 한 번만 남도록 REVOKED가 아닐 때만 바꾼다.
      const { count } = await tx.ownership.updateMany({
        where: { id: ownershipId, endedAt: null, verificationStatus: { not: 'REVOKED' } },
        data: { verificationStatus: 'REVOKED' },
      });
      if (count > 0) {
        const before = computeOwnershipVerificationStatus(ownership, getNow());
        await audit.record({
          actor,
          action: 'OWNERSHIP_REVOKED_BY_ADMIN',
          resourceType: 'OWNERSHIP',
          resourceId: ownershipId,
          summary: `${before} → REVOKED`,
          before: { verificationStatus: before },
          after: { verificationStatus: 'REVOKED', reason },
          req,
          client: tx,
        });
      }
    }
    const updated = await tx.ownership.findUnique({ where: { id: ownershipId }, include: OWNERSHIP_INCLUDE });
    return toAdminOwnership(updated, getNow());
  });

// POST /admin/property-ownerships/:ownershipId/end. 사용자 종료와 같은 종료 로직을 쓰되,
// 운영자 종료는 계약이 있어도 진행한다(api-contract.md 3장). 계약은 이전 소유자·임차인에게 읽기 전용으로 남는다.
export const endOwnershipByAdmin = (actor, ownershipId, { reason }, req) =>
  prisma.$transaction(async (tx) => {
    // 사용자 종료·계약 쓰기와 같은 행 잠금으로 줄을 세운다.
    const ownership = await lockOwnershipRow(tx, ownershipId);
    if (!ownership) throwOwnershipNotFound();

    await endOwnershipInTx(tx, ownership, { endReason: 'ADMIN_ENDED', note: reason, checkActiveContracts: false });
    await audit.record({
      actor,
      action: 'OWNERSHIP_ENDED',
      resourceType: 'OWNERSHIP',
      resourceId: ownershipId,
      summary: 'ADMIN_ENDED',
      after: { endReason: 'ADMIN_ENDED', reason },
      req,
      client: tx,
    });
    const ended = await tx.ownership.findUnique({ where: { id: ownershipId }, include: OWNERSHIP_INCLUDE });
    return toAdminOwnership(ended, getNow());
  });

// GET /admin/jobs. 최근 순 커서 방식(감사 로그와 같음).
export const findAdminJobs = async ({ status, cursor, size }) => {
  const where = { ...(status && { status }), ...afterCreatedAtCursor(cursor) };
  const jobs = await prisma.job.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: size + 1 });
  const { items, meta } = toCursorPage(jobs, size);
  return { items: items.map(toJobResponse), meta };
};

const throwJobNotRetryable = () => {
  throw new AppError('JOB_NOT_RETRYABLE', 422, '실패한 작업만 다시 시도할 수 있습니다.');
};

// POST /admin/jobs/:jobId/retry. FAILED만 PENDING으로 되돌린다. 실행 수단(워커)은 아직 없어서
// 여기서는 상태만 바꾸고, 실제 재실행은 jobs.enqueue()·워커가 생기면 붙인다(api-contract.md 8장 "작업(Job)").
export const retryJob = (actor, jobId, req) =>
  prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('JOB_NOT_FOUND', 404, '작업을 찾을 수 없습니다.');
    if (job.status !== 'FAILED') throwJobNotRetryable();

    // 동시에 재시도해도 한 번만 바뀌도록 FAILED 조건을 건다.
    const { count } = await tx.job.updateMany({
      where: { id: jobId, status: 'FAILED' },
      data: { status: 'PENDING', error: Prisma.DbNull, lockedAt: null, runAfter: getNow() },
    });
    if (count === 0) throwJobNotRetryable();

    await audit.record({
      actor,
      action: 'JOB_RETRIED',
      resourceType: 'JOB',
      resourceId: jobId,
      summary: `${job.type} FAILED → PENDING`,
      before: { status: 'FAILED', error: job.error },
      after: { status: 'PENDING' },
      req,
      client: tx,
    });
    return { jobId, status: 'PENDING' };
  });
