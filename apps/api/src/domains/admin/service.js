import { AppError } from '../../platform/AppError.js';
import { audit } from '../../platform/audit.js';
import { getNow, getTodayKST } from '../../platform/dateUtils.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { prisma } from '../../platform/prismaClient.js';
import { formatDisplayName } from '../../platform/unitAddress.js';
import { runKaptBasisRefreshNow } from '../../referenceData/kaptExcelRefresh.js';
import { ImportAlreadyRunningError } from '../../referenceData/referenceImports.js';
import { revokeAllSessions, toPublicUser } from '../auth/service.js';
import { JusoRefreshBusyError, runJusoRefreshNow } from '../cron/referenceData.js';
import { encodeAuditLogCursor } from './auditLogCursor.js';
import { splitExpiredOwnerships, sumCounts, toCountMap } from './dashboardCounts.js';
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
const JOB_STATUSES = ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'];

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
    ...(cursor && {
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    }),
  };
  const logs = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: size + 1 });
  const hasNext = logs.length > size;
  const items = logs.slice(0, size);
  return {
    items: items.map(toAuditLogResponse),
    meta: { nextCursor: hasNext ? encodeAuditLogCursor(items[items.length - 1]) : null, hasNext },
  };
};
