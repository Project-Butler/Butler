// 계약(api-contract.md 4장). 쓰기는 모두 소유 관계 행을 잠근 트랜잭션 안에서 한다(platform/ownershipLock.js).
// 검사 순서는 docs/4. 계약 관리 개발/명세.md 3-3을 따른다(형식 R-01은 컨트롤러).
import { Prisma } from '@prisma/client';
import { ACTIVITY_TYPES, recordActivity } from '../../platform/activityLog.js';
import { audit } from '../../platform/audit.js';
import { AppError } from '../../platform/AppError.js';
import {
  isContractReadOnly,
  isValidAmount,
  isValidPeriod,
  isValidRentPaymentDay,
  isValidTermination,
  lockedFieldsForStatus,
  statusToWhere,
} from '../../platform/contractRules.js';
import { CONTRACT_INCLUDE, resolveContractViewer, toContractResponse } from '../../platform/contractSerializer.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { computeOwnershipVerificationStatus } from '../../platform/ownershipStatus.js';
import { compareDateStrings, getNow, getTodayKST, toDateOnlyString } from '../../platform/dateUtils.js';
import { lockOwnershipRow } from '../../platform/ownershipLock.js';
import { prisma } from '../../platform/prismaClient.js';

const toDbDate = (dateString) => new Date(`${dateString}T00:00:00Z`);

const throwContractNotFound = () => {
  throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
};

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

const throwReadOnly = (details = []) => {
  throw new AppError(
    'CONTRACT_READ_ONLY',
    422,
    '진행 중이거나 끝난 계약이라 이 내용을 바꿀 수 없습니다. 해지 후 새로 등록하거나 갱신해 주세요.',
    details,
  );
};

const assertAmount = (contract) => {
  if (!isValidAmount(contract)) {
    throw new AppError(
      'CONTRACT_INVALID_AMOUNT',
      422,
      '계약 유형과 금액이 맞지 않습니다. 월세는 월세 1원 이상, 전세는 월세 0원·보증금 1원 이상이어야 합니다.',
    );
  }
};

const assertPeriod = (contract) => {
  if (!isValidPeriod(contract)) {
    throw new AppError('CONTRACT_INVALID_PERIOD', 422, '종료일은 시작일보다 뒤여야 합니다.');
  }
};

// 월세 입금일은 계약 유형과 합쳐 본다(형식 R-01 단계, 400). 1~31 범위는 컨트롤러가 이미 봤고,
// 여기서는 전세에 값이 있는 경우만 남는다.
const assertRentPaymentDay = (contract) => {
  if (!isValidRentPaymentDay(contract)) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
      { field: 'rentPaymentDay', reason: 'NOT_ALLOWED_FOR_JEONSE' },
    ]);
  }
};

const throwPeriodOverlap = () => {
  throw new AppError('CONTRACT_PERIOD_OVERLAP', 409, '같은 기간에 이미 등록한 계약이 있습니다.');
};

// R-07: 같은 소유 관계 안에서 해지 안 된 계약과 기간이 겹치면 안 된다(양끝 포함).
const assertNoOverlap = async (tx, { ownershipId, startDate, endDate, excludeId = null }) => {
  const overlapping = await tx.contract.findFirst({
    where: {
      ownershipId,
      terminatedOn: null,
      startDate: { lte: toDbDate(endDate) },
      endDate: { gte: toDbDate(startDate) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (overlapping) throwPeriodOverlap();
};

// DB 제약 ex_contract_period(SQLSTATE 23P01)에 걸려도 같은 409로 답한다. assertNoOverlap이 먼저 막으므로
// 보통은 닿지 않는 마지막 방어선. Prisma가 코드 없는 오류로 넘겨서 제약 이름으로 알아본다.
// 실패한 트랜잭션 안에서는 다른 쿼리를 못 하므로 트랜잭션 밖에서 바꾼다.
export const withPeriodConflictAs409 = async (write) => {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes('ex_contract_period')) {
      throwPeriodOverlap();
    }
    throw error;
  }
};

// R-05(D-05): 같은 소유 관계의 계약이고, 그 계약이 끝난 날(해지일 또는 종료일) ≤ 새 시작일.
const assertPreviousContract = async (tx, { ownershipId, previousContractId, startDate }) => {
  if (!previousContractId) return;
  const previous = await tx.contract.findFirst({
    where: { id: previousContractId, ownershipId },
    select: { endDate: true, terminatedOn: true },
  });
  const previousEnd = previous ? toDateOnlyString(previous.terminatedOn ?? previous.endDate) : null;
  if (!previousEnd || compareDateStrings(previousEnd, startDate) > 0) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
      { field: 'previousContractId', reason: 'INVALID_PREVIOUS_CONTRACT' },
    ]);
  }
};

const activityParams = (contract) => ({
  buildingNo: contract.ownership.property.buildingNo,
  unitNo: contract.ownership.property.unitNo,
  tenantName: contract.tenantName,
});

const recordContractActivity = (tx, user, type, contract, extra = {}) =>
  recordActivity(tx, {
    userId: user.id,
    type,
    complexId: contract.ownership.property.complexId,
    propertyId: contract.ownership.propertyId,
    params: { ...activityParams(contract), ...extra },
  });

// 감사 로그 before/after에는 이 칸만 넣는다(계약 객체를 통째로 넘기지 않는다).
// 메모(운영자에게 숨김, D-19)·해지 사유·임차인 이름·연락처는 어디에도 넣지 않는다.
const AUDIT_FIELDS = [
  'leaseType',
  'deposit',
  'monthlyRent',
  'rentPaymentDay',
  'startDate',
  'endDate',
  'previousContractId',
  'terminatedOn',
];
const AUDIT_DATE_FIELDS = ['startDate', 'endDate', 'terminatedOn'];
// 수정 summary에 쓰는 칸 이름(값은 넣지 않는다)
const FIELD_LABELS = {
  leaseType: '계약 유형',
  deposit: '보증금',
  monthlyRent: '월세',
  rentPaymentDay: '월세 입금일',
  startDate: '시작일',
  endDate: '종료일',
  tenantName: '임차인 이름',
  tenantPhone: '임차인 연락처',
  memo: '메모',
};

const pickAuditFields = (contract, fields) =>
  Object.fromEntries(
    fields
      .filter((field) => AUDIT_FIELDS.includes(field))
      .map((field) => [field, AUDIT_DATE_FIELDS.includes(field) ? toDateOnlyString(contract[field]) : contract[field]]),
  );

// 칸이 없으면 빈 객체 대신 undefined
const orUndefined = (picked) => (Object.keys(picked).length > 0 ? picked : undefined);

const recordContractAudit = (tx, user, req, { action, contract, summary, before, after }) =>
  audit.record({ actor: user, action, resourceType: 'CONTRACT', resourceId: contract.id, summary, before, after, req, client: tx });

const respond = (contract, user, todayKST = getTodayKST()) =>
  toContractResponse(contract, { viewer: resolveContractViewer(contract, user), todayKST });

// POST /contracts
export const createContract = async (user, input, req) => {
  assertRentPaymentDay(input);
  const created = await withPeriodConflictAs409(() => prisma.$transaction(async (tx) => {
    const ownership = await lockOwnershipRow(tx, input.ownershipId);
    if (!ownership || ownership.userId !== user.id) throwOwnershipNotFound();
    assertAmount(input);
    assertPeriod(input);
    await assertPreviousContract(tx, input);
    if (ownership.endedAt) {
      throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
    }
    if (computeOwnershipVerificationStatus(ownership, getNow()) !== 'VERIFIED') {
      throw new AppError('OWNERSHIP_VERIFICATION_REQUIRED', 403, '권리자 인증을 마친 호실만 계약을 등록할 수 있습니다.');
    }
    await assertNoOverlap(tx, input);

    const contract = await tx.contract.create({
      data: {
        ownershipId: input.ownershipId,
        leaseType: input.leaseType,
        deposit: input.deposit,
        monthlyRent: input.monthlyRent,
        rentPaymentDay: input.rentPaymentDay ?? null,
        startDate: toDbDate(input.startDate),
        endDate: toDbDate(input.endDate),
        tenantName: input.tenantName,
        tenantPhone: input.tenantPhone,
        previousContractId: input.previousContractId,
        memo: input.memo,
      },
      include: CONTRACT_INCLUDE,
    });
    await recordContractActivity(tx, user, ACTIVITY_TYPES.CONTRACT_CREATED, contract);
    await recordContractAudit(tx, user, req, {
      action: 'CONTRACT_CREATED',
      contract,
      summary: '계약 등록',
      after: pickAuditFields(contract, AUDIT_FIELDS),
    });
    return contract;
  }));

  // TODO(schedule): 종료일 SYSTEM 일정 생성 — 일정 기능이 생기면 연결한다.
  return respond(created, user);
};

const SORT_FIELDS = { endDate: 'endDate', startDate: 'startDate', createdAt: 'createdAt' };

// GET /contracts — 내 소유 관계(활성·종료)의 계약 + 내가 임차인인 계약.
export const findContracts = async (user, { propertyId, ownershipId, activeOwnership, includeEndedOwnership, statuses, sort, page, size }) => {
  const todayKST = getTodayKST();
  const filters = [{ OR: [{ ownership: { userId: user.id } }, { tenantId: user.id }] }];
  if (propertyId) filters.push({ ownership: { propertyId } });
  if (ownershipId) filters.push({ ownershipId });
  // 매도 등으로 끝난 소유 관계의 계약은 읽기 전용이라 만료 임박 배지에서 뺀다.
  if (activeOwnership) filters.push({ ownership: { endedAt: null } });
  if (statuses.length > 0) {
    const statusWhere = statusToWhere(statuses, todayKST);
    // 임대인 화면의 '끝남': status와 무관하게 소유 관계가 끝난 계약도 함께 받는다.
    filters.push(includeEndedOwnership ? { OR: [statusWhere, { ownership: { endedAt: { not: null } } }] } : statusWhere);
  }
  const where = { AND: filters };

  const [total, rows] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: CONTRACT_INCLUDE,
      orderBy: [{ [SORT_FIELDS[sort.field]]: sort.direction }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);

  return {
    items: rows.map((contract) => respond(contract, user, todayKST)),
    meta: { page, size, total, hasNext: page * size < total },
  };
};

// GET /contracts/:contractId — 볼 수 없으면 null(컨트롤러가 404).
export const findContractForUser = async (user, contractId) => {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, include: CONTRACT_INCLUDE });
  if (!contract || !resolveContractViewer(contract, user)) return null;
  return respond(contract, user);
};

// 쓰기 공통: 계약을 찾고 그 소유 관계를 잠근다. 요청자가 그 소유자가 아니면 404(R-10).
const lockContractForOwner = async (tx, user, contractId) => {
  const found = await tx.contract.findUnique({ where: { id: contractId }, select: { ownershipId: true } });
  if (!found) throwContractNotFound();
  const ownership = await lockOwnershipRow(tx, found.ownershipId);
  if (ownership.userId !== user.id) throwContractNotFound();
  // 잠근 뒤 다시 읽어 그 사이 바뀐 값을 본다.
  const contract = await tx.contract.findUnique({ where: { id: contractId }, include: CONTRACT_INCLUDE });
  return { contract, ownership };
};

// PATCH /contracts/:contractId — input은 컨트롤러가 검증·변환한 값(보낸 칸만).
export const updateContract = async (user, contractId, input, req) => {
  const updated = await withPeriodConflictAs409(() => prisma.$transaction(async (tx) => {
    const { contract, ownership } = await lockContractForOwner(tx, user, contractId);
    const status = computeContractStatus(contract, getTodayKST());
    // 입력값 검사(400, 전세 입금일)가 읽기 전용·잠금(422)보다 먼저다(3-3, R-01).
    const leaseType = input.leaseType ?? contract.leaseType;
    if (input.rentPaymentDay !== undefined) assertRentPaymentDay({ leaseType, rentPaymentDay: input.rentPaymentDay });
    if (isContractReadOnly(status, Boolean(ownership.endedAt))) throwReadOnly();
    const locked = lockedFieldsForStatus(status, Object.keys(input));
    if (locked.length > 0) throwReadOnly(locked.map((field) => ({ field, reason: 'LOCKED_WHILE_ACTIVE' })));
    // 시작 전 계약을 전세로 바꾸면 입금일을 서버가 비운다(#76 Q5). 바뀐 칸이라 감사 로그에도 남는다.
    const clearsRentPaymentDay = leaseType === 'JEONSE' && input.rentPaymentDay === undefined && contract.rentPaymentDay !== null;
    const data = clearsRentPaymentDay ? { ...input, rentPaymentDay: null } : input;

    // 보낸 칸과 저장된 값을 합친 결과로 다시 검사한다.
    const merged = {
      leaseType,
      deposit: data.deposit ?? contract.deposit,
      monthlyRent: data.monthlyRent ?? contract.monthlyRent,
      startDate: data.startDate ?? toDateOnlyString(contract.startDate),
      endDate: data.endDate ?? toDateOnlyString(contract.endDate),
    };
    assertAmount(merged);
    assertPeriod(merged);
    if (data.startDate || data.endDate) {
      await assertNoOverlap(tx, { ...merged, ownershipId: contract.ownershipId, excludeId: contract.id });
    }

    const row = await tx.contract.update({
      where: { id: contract.id },
      data: {
        ...data,
        ...(data.startDate ? { startDate: toDbDate(data.startDate) } : {}),
        ...(data.endDate ? { endDate: toDbDate(data.endDate) } : {}),
      },
      include: CONTRACT_INCLUDE,
    });
    await recordContractActivity(tx, user, ACTIVITY_TYPES.CONTRACT_UPDATED, row, { fields: Object.keys(data) });
    const changedFields = Object.keys(data);
    await recordContractAudit(tx, user, req, {
      action: 'CONTRACT_UPDATED',
      contract: row,
      summary: `계약 수정: ${changedFields.map((field) => FIELD_LABELS[field]).join(', ')}`,
      before: orUndefined(pickAuditFields(contract, changedFields)),
      after: orUndefined(pickAuditFields(row, changedFields)),
    });
    return row;
  }));

  // TODO(schedule): endDate가 바뀌면 SYSTEM 일정도 옮긴다.
  return respond(updated, user);
};

// POST /contracts/:contractId/terminate
export const terminateContract = async (user, contractId, { terminatedOn, reason }, req) => {
  const terminated = await prisma.$transaction(async (tx) => {
    const { contract, ownership } = await lockContractForOwner(tx, user, contractId);
    const todayKST = getTodayKST();
    const status = computeContractStatus(contract, todayKST);
    if (status === 'EXPIRED' || status === 'TERMINATED') {
      throw new AppError('CONTRACT_NOT_TERMINABLE', 422, '이미 만료되었거나 해지된 계약입니다.');
    }
    if (ownership.endedAt) throwReadOnly();
    if (!isValidTermination({ endDate: toDateOnlyString(contract.endDate), terminatedOn, todayKST })) {
      throw new AppError('CONTRACT_INVALID_PERIOD', 422, '해지일은 오늘과 계약 종료일 중 이른 날 이전이어야 합니다.');
    }

    const row = await tx.contract.update({
      where: { id: contract.id },
      data: { terminatedOn: toDbDate(terminatedOn), terminationReason: reason },
      include: CONTRACT_INCLUDE,
    });
    await recordContractActivity(tx, user, ACTIVITY_TYPES.CONTRACT_TERMINATED, row);
    await recordContractAudit(tx, user, req, {
      action: 'CONTRACT_TERMINATED',
      contract: row,
      summary: '계약 해지',
      before: { terminatedOn: null },
      after: { terminatedOn },
    });
    return row;
  });

  // TODO(schedule): 종료일 SYSTEM 일정 삭제.
  return respond(terminated, user);
};
