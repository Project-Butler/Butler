// 권리자 인증 결과 반영(계약 9장 applyOwnershipVerification). 소유자 이름·번호·생년월일은 받지 않는다 — 판정은 호출 쪽이 끝낸다.
import { ACTIVITY_TYPES, recordActivity } from './activityLog.js';
import { audit } from './audit.js';
import { getNow } from './dateUtils.js';
import { endOwnershipInTx } from './ownershipEnd.js';
import { lockActiveOwnershipRows, lockOwnershipRow } from './ownershipLock.js';
import { computeOwnershipVerificationStatus } from './ownershipStatus.js';
import {
  ACTIVE_ATTEMPT_STATUSES,
  computeVerificationExpiry,
  DEFAULT_VALIDITY_YEARS,
  hasEarlierRevokedOwner,
  parseValidityYears,
  STALE_ATTEMPT_MS,
  UNVERIFIED_RETENTION_DAYS,
} from './ownershipVerificationRules.js';
import { prisma } from './prismaClient.js';
// 인증 전 기록의 첨부 파일 삭제(H-37). storage/index.js는 service를 import하지 않아 순환이 없다.
import { removeStoredObjects } from '../domains/documents/storage/index.js';

export const VALIDITY_SETTING_KEY = 'OWNERSHIP_VERIFICATION_VALIDITY_YEARS';
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
const STALE_SWEEP_LIMIT = 200;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const readValiditySetting = async (client = prisma) => {
  const row = await client.platformSetting.findUnique({ where: { key: VALIDITY_SETTING_KEY } });
  return { validityYears: parseValidityYears(row?.value) ?? DEFAULT_VALIDITY_YEARS, updatedAt: row?.updatedAt ?? null };
};

export const writeValiditySetting = (client, years) =>
  client.platformSetting.upsert({
    where: { key: VALIDITY_SETTING_KEY },
    create: { key: VALIDITY_SETTING_KEY, value: String(years) },
    update: { value: String(years) },
  });

// 시도를 끝내는 유일한 함수. expectedStatus가 아니면 false.
export const finishAttempt = async (tx, attemptId, expectedStatus, result) => {
  const now = getNow();
  const { count } = await tx.ownershipVerificationAttempt.updateMany({
    where: { id: attemptId, status: expectedStatus },
    data: {
      status: result.status,
      reasonCode: result.reasonCode ?? null,
      ledgerKind: result.ledgerKind ?? undefined,
      ownerCount: result.ownerCount ?? undefined,
      finishedAt: now,
      updatedAt: now,
    },
  });
  return count > 0;
};

const loadAttemptContext = (tx, attemptId) =>
  tx.ownershipVerificationAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      ownershipId: true,
      requestedBy: true,
      ownership: { select: { propertyId: true, property: { select: { complexId: true, buildingNo: true, unitNo: true } } } },
    },
  });

const toUnitParams = (property) => ({ buildingNo: property.buildingNo, unitNo: property.unitNo });

// 실패로 끝내고 감사(사유 포함)·활동(사유 없음)을 남긴다. 이미 끝났으면 false.
export const failAttemptInTx = async (tx, attemptId, expectedStatus, reasonCode, { ledgerKind, ownerCount } = {}) => {
  const finished = await finishAttempt(tx, attemptId, expectedStatus, { status: 'FAILED', reasonCode, ledgerKind, ownerCount });
  if (!finished) return false;

  const attempt = await loadAttemptContext(tx, attemptId);
  await audit.record({
    action: 'OWNERSHIP_VERIFICATION_FAILED',
    resourceType: 'OWNERSHIP',
    resourceId: attempt.ownershipId,
    summary: reasonCode,
    after: { attemptId, reasonCode },
    client: tx,
  });
  await recordActivity(tx, {
    userId: attempt.requestedBy,
    type: ACTIVITY_TYPES.OWNERSHIP_VERIFICATION_FAILED,
    complexId: attempt.ownership.property.complexId,
    propertyId: attempt.ownership.propertyId,
    params: { attemptId, ...toUnitParams(attempt.ownership.property) },
  });
  return true;
};

// 10분이 지난 진행 중 시도를 TIMED_OUT으로 끝낸다(전역). 조건 갱신이라 동시에 돌아도 한 번만 끝난다.
export const expireStaleAttempts = async ({ client = prisma, now = getNow() } = {}) => {
  const stale = await client.ownershipVerificationAttempt.findMany({
    where: { status: { in: [...ACTIVE_ATTEMPT_STATUSES] }, createdAt: { lt: new Date(now.getTime() - STALE_ATTEMPT_MS) } },
    select: { id: true, status: true },
    orderBy: { createdAt: 'asc' },
    take: STALE_SWEEP_LIMIT,
  });

  let expired = 0;
  for (const { id, status } of stale) {
    const finished = await client.$transaction((tx) => failAttemptInTx(tx, id, status, 'TIMED_OUT'));
    if (finished) expired += 1;
  }
  return expired;
};

const defaultSaveVerified = (tx, { ownershipId, attemptId, verifiedAt, expiresAt }) =>
  tx.ownership.update({
    where: { id: ownershipId },
    data: { verificationStatus: 'VERIFIED', verifiedAt, verificationExpiresAt: expiresAt, checkId: attemptId },
  });

// 지울 파일 경로(인증 전 기록의 첨부, H-37)를 돌려준다. 호출하는 쪽이 커밋 뒤 removeStoredObjects로 지운다.
const endOwnerAutomatically = async (tx, row, endReason) => {
  const { ownership: ended, removedPaths } = await endOwnershipInTx(tx, row, { endReason, note: null, checkActiveContracts: false });
  await audit.record({
    action: 'OWNERSHIP_ENDED',
    resourceType: 'OWNERSHIP',
    resourceId: row.id,
    summary: endReason,
    after: { endReason },
    client: tx,
  });
  await recordActivity(tx, {
    userId: row.userId,
    type: ACTIVITY_TYPES.OWNERSHIP_ENDED,
    complexId: ended.property.complexId,
    propertyId: ended.propertyId,
    params: { ...toUnitParams(ended.property), endReason },
  });
  return removedPaths;
};

// 기간 안에 인증하지 않은 등록을 끝낸다(cron). 진행 중 시도가 있으면 이번에는 건너뛴다.
export const endAbandonedUnverifiedOwnerships = async ({ now = getNow() } = {}) => {
  const startedBefore = new Date(now.getTime() - UNVERIFIED_RETENTION_DAYS * MS_PER_DAY);
  const noActiveAttempt = { verificationAttempts: { none: { status: { in: [...ACTIVE_ATTEMPT_STATUSES] } } } };
  const candidates = await prisma.ownership.findMany({
    where: { endedAt: null, verificationStatus: 'UNVERIFIED', startedAt: { lt: startedBefore }, ...noActiveAttempt },
    select: { id: true },
    orderBy: { startedAt: 'asc' },
    take: STALE_SWEEP_LIMIT,
  });

  let ended = 0;
  for (const { id } of candidates) {
    const removedPaths = await prisma.$transaction(async (tx) => {
      const row = await lockOwnershipRow(tx, id);
      if (!row || row.endedAt || row.verificationStatus !== 'UNVERIFIED') return null;
      const active = await tx.ownershipVerificationAttempt.count({ where: { ownershipId: id, status: { in: [...ACTIVE_ATTEMPT_STATUSES] } } });
      if (active > 0) return null;
      return endOwnerAutomatically(tx, row, 'UNVERIFIED_EXPIRED');
    });
    if (removedPaths) {
      ended += 1;
      await removeStoredObjects(removedPaths);
    }
  }
  return { ended };
};

// 잠근 활성 행(rows)에서 ownershipId를 인증할 수 있는지. 막히면 { reasonCode }, 아니면 { mine, others }.
// 잠금 안에서 다른 행의 만료를 다시 계산한다.
const checkVerifiable = (rows, ownershipId, now) => {
  const mine = rows.find((row) => row.id === ownershipId);
  if (!mine || mine.verificationStatus === 'REVOKED') return { reasonCode: 'OWNERSHIP_CHANGED' };
  const others = rows.filter((row) => row.id !== mine.id);
  if (others.some((row) => computeOwnershipVerificationStatus(row, now) === 'VERIFIED')) return { reasonCode: 'VERIFIED_OWNER_EXISTS' };
  if (mine.verificationStatus !== 'VERIFIED' && hasEarlierRevokedOwner(rows, mine)) return { reasonCode: 'NOT_FIRST_REGISTRANT' };
  return { mine, others };
};

// 인증을 저장한다: 먼저 인증한 사람이 소유자라 만료·미인증인 다른 행을 자동 종료하고(REVOKED는 관리자 처리까지 남긴다)
// 내 행을 VERIFIED로 저장한 뒤 감사·활동을 남긴다. 인증한 적 없는 행의 기록 첨부 파일 경로를 돌려준다(커밋 뒤 지운다, H-37).
// sharedFromOwnershipId: 같은 건물의 다른 방 인증을 이어받은 경우 그 소유 관계 id(감사에만 남긴다).
// ledgerUnit: 대장(전유부) 값으로 호실 면적·층을 덮어쓴 경우 쓴 값(감사에만 남긴다).
const saveVerifiedInTx = async (
  tx,
  { mine, others, property, attemptId, now, expiresAt, saveVerified, sharedFromOwnershipId = null, ledgerUnit = null },
) => {
  const removedPaths = [];
  for (const row of others) {
    if (['EXPIRED', 'UNVERIFIED'].includes(computeOwnershipVerificationStatus(row, now))) {
      removedPaths.push(...(await endOwnerAutomatically(tx, row, 'SUPERSEDED')));
    }
  }

  await saveVerified(tx, { ownershipId: mine.id, attemptId, verifiedAt: now, expiresAt });
  // 처음 인증 시각은 한 번만 채운다(재인증으로 덮어써지는 verifiedAt과 별개, 하우스 로그 H-37·H-44).
  await tx.ownership.updateMany({ where: { id: mine.id, firstVerifiedAt: null }, data: { firstVerifiedAt: now } });

  await audit.record({
    action: 'OWNERSHIP_VERIFICATION_APPLIED',
    resourceType: 'OWNERSHIP',
    resourceId: mine.id,
    summary: 'VERIFIED',
    after: {
      attemptId,
      verificationStatus: 'VERIFIED',
      verificationExpiresAt: expiresAt,
      ...(sharedFromOwnershipId ? { sharedFromOwnershipId } : {}),
      ...(ledgerUnit ? { ledgerUnit } : {}),
    },
    client: tx,
  });
  await recordActivity(tx, {
    userId: mine.userId,
    type: ACTIVITY_TYPES.OWNERSHIP_VERIFIED,
    complexId: property.complexId,
    propertyId: mine.propertyId,
    params: { attemptId, expiresAt: expiresAt.toISOString(), ...toUnitParams(property) },
  });
  return removedPaths;
};

// ── 같은 건물 인증 공유(2026-11-25 사용자 결정) ──
// 일반건축물대장(다가구 등)은 건물 전체가 1건이라, 한 방의 인증이 그 건물 전체의 소유를 확인한 것이다.
// 그래서 같은 건물(같은 단지·동)의 내 다른 활성 방에도 같은 인증을 적용한다. 만료일은 원래 방과 같다.
// 집합건축물대장(전유부)은 방마다 대장이 달라 공유하지 않는다.
// 방마다 일반 인증과 같은 규칙을 거친다 — 다른 사람이 인증한 방·철회된 방·앞선 철회자가 있는 방은 건너뛴다.

// source: { ownershipId, userId, attemptId, expiresAt }, target: { id, propertyId, property }
const shareToOwnershipInTx = async (tx, source, target, { now, saveVerified }) => {
  const rows = await lockActiveOwnershipRows(tx, target.propertyId);
  const checked = checkVerifiable(rows, target.id, now);
  if (checked.reasonCode) return [];
  return saveVerifiedInTx(tx, {
    ...checked,
    property: target.property,
    attemptId: source.attemptId,
    now,
    expiresAt: source.expiresAt,
    saveVerified,
    sharedFromOwnershipId: source.ownershipId,
  });
};

const SHARE_TARGET_SELECT = { id: true, propertyId: true, property: { select: { complexId: true, buildingNo: true, unitNo: true } } };

// 인증한 방(source)과 같은 건물의 내 다른 활성 방 전부에 적용한다(이미 인증된 방은 만료일을 함께 갱신).
// 여러 호실을 잠그므로 호실 id 순서로 잠가 교착을 줄인다. 지울 첨부 파일 경로를 돌려준다.
const shareToBuildingInTx = async (tx, source, building, { now, saveVerified }) => {
  const targets = await tx.ownership.findMany({
    where: {
      userId: source.userId,
      endedAt: null,
      id: { not: source.ownershipId },
      property: { complexId: building.complexId, buildingNo: building.buildingNo },
    },
    select: SHARE_TARGET_SELECT,
    orderBy: [{ propertyId: 'asc' }, { id: 'asc' }],
  });
  const removedPaths = [];
  for (const target of targets) removedPaths.push(...(await shareToOwnershipInTx(tx, source, target, { now, saveVerified })));
  return removedPaths;
};

// 호실 등록(POST /properties) 트랜잭션 안에서 부른다. 같은 건물에 일반건축물대장으로 인증된 내 방이 있으면
// 새로 만든 소유 관계에 그 인증을 적용한다. 돌려주는 값: { shared, removedPaths } — removedPaths는 커밋 뒤 지운다.
export const shareBuildingVerificationOnRegisterInTx = async (tx, { ownershipId, now = getNow(), saveVerified = defaultSaveVerified }) => {
  const target = await tx.ownership.findUnique({ where: { id: ownershipId }, select: { ...SHARE_TARGET_SELECT, userId: true } });
  if (!target) return { shared: false, removedPaths: [] };

  const candidates = await tx.ownership.findMany({
    where: {
      userId: target.userId,
      endedAt: null,
      id: { not: target.id },
      verificationStatus: 'VERIFIED',
      verificationExpiresAt: { gt: now },
      checkId: { not: null },
      property: { complexId: target.property.complexId, buildingNo: target.property.buildingNo },
    },
    select: { id: true, userId: true, checkId: true, verificationExpiresAt: true },
    orderBy: [{ verificationExpiresAt: 'desc' }, { id: 'asc' }],
  });
  if (candidates.length === 0) return { shared: false, removedPaths: [] };

  const generalAttempts = await tx.ownershipVerificationAttempt.findMany({
    where: { id: { in: candidates.map((row) => row.checkId) }, status: 'VERIFIED', ledgerKind: 'GENERAL' },
    select: { id: true },
  });
  const generalIds = new Set(generalAttempts.map((attempt) => attempt.id));
  const source = candidates.find((row) => generalIds.has(row.checkId));
  if (!source) return { shared: false, removedPaths: [] };

  const removedPaths = await shareToOwnershipInTx(
    tx,
    { ownershipId: source.id, userId: source.userId, attemptId: source.checkId, expiresAt: source.verificationExpiresAt },
    target,
    { now, saveVerified },
  );
  const after = await tx.ownership.findUnique({ where: { id: target.id }, select: { verificationStatus: true } });
  return { shared: after.verificationStatus === 'VERIFIED', removedPaths };
};

// 대장(전유부)에서 읽은 전용면적·층으로 호실 값을 덮어쓴다(2026-11-26 사용자 결정: 입력해 둔 값이 있어도 대장 값이 우선).
// 읽지 못한 칸(null)은 건드리지 않는다. 일반건축물대장은 건물 전체 대장이라 호실 값이 없어 쓰지 않는다. 쓴 값을 돌려준다(없으면 null).
const applyLedgerUnitInTx = async (tx, propertyId, { ledgerKind, unit }) => {
  if (ledgerKind !== 'UNIT_EXCLUSIVE' || !unit) return null;
  const data = {};
  if (unit.exclusiveArea !== null) data.exclusiveArea = unit.exclusiveArea;
  if (unit.floor !== null) data.floor = unit.floor;
  if (Object.keys(data).length === 0) return null;
  await tx.property.update({ where: { id: propertyId }, data });
  return data;
};

const applyInTx = async (tx, { attemptId, ledgerKind, ownerCount, unit, saveVerified }) => {
  const now = getNow();
  const fail = async (reasonCode) => {
    await failAttemptInTx(tx, attemptId, 'RUNNING', reasonCode, { ledgerKind, ownerCount });
    return { outcome: 'FAILED', reasonCode };
  };

  // 1. RUNNING일 때만 시각을 갱신해 시도 행을 잠근다. 0건이면 늦은 결과라 전부 버린다.
  const { count } = await tx.ownershipVerificationAttempt.updateMany({
    where: { id: attemptId, status: 'RUNNING' },
    data: { updatedAt: now },
  });
  if (count === 0) return { outcome: 'IGNORED' };
  const attempt = await loadAttemptContext(tx, attemptId);

  // 2. 호실의 활성 행을 id 순서로 잠그고 3. 인증할 수 있는지 확인한다.
  const rows = await lockActiveOwnershipRows(tx, attempt.ownership.propertyId);
  const checked = checkVerifiable(rows, attempt.ownershipId, now);
  if (checked.reasonCode) return fail(checked.reasonCode);

  // 4. 인증을 저장하고 시도를 끝낸다. 유효기간은 지금 값으로 계산해 저장한다.
  const { validityYears } = await readValiditySetting(tx);
  const expiresAt = computeVerificationExpiry(now, validityYears);
  const property = attempt.ownership.property;
  const ledgerUnit = await applyLedgerUnitInTx(tx, attempt.ownership.propertyId, { ledgerKind, unit });
  const removedPaths = await saveVerifiedInTx(tx, { ...checked, property, attemptId, now, expiresAt, saveVerified, ledgerUnit });
  await finishAttempt(tx, attemptId, 'RUNNING', { status: 'VERIFIED', ledgerKind, ownerCount });

  // 5. 일반건축물대장이면 같은 건물의 내 다른 방에도 적용한다.
  if (ledgerKind === 'GENERAL') {
    const source = { ownershipId: checked.mine.id, userId: checked.mine.userId, attemptId, expiresAt };
    removedPaths.push(...(await shareToBuildingInTx(tx, source, property, { now, saveVerified })));
  }
  return { outcome: 'VERIFIED', expiresAt, removedPaths };
};

// 돌려주는 값: { outcome: 'VERIFIED', expiresAt } | { outcome: 'FAILED', reasonCode } | { outcome: 'IGNORED' }(늦은 결과).
// 판정 실패는 throw하지 않고 같은 트랜잭션에서 실패 기록을 커밋한다.
// uq_ownership_verified 충돌은 롤백 후 별도 트랜잭션에서 VERIFIED_OWNER_EXISTS로 끝낸다.
// unit: 러너 결과의 전유부 전용면적·층(parseRunnerResult), 없으면 생략.
export const applyOwnershipVerification = async ({ attemptId, ledgerKind, ownerCount, unit = null }, { saveVerified = defaultSaveVerified } = {}) => {
  try {
    const { removedPaths = [], ...result } = await prisma.$transaction(
      (tx) => applyInTx(tx, { attemptId, ledgerKind, ownerCount, unit, saveVerified }),
      TX_OPTIONS,
    );
    await removeStoredObjects(removedPaths);
    return result;
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    await prisma.$transaction((tx) => failAttemptInTx(tx, attemptId, 'RUNNING', 'VERIFIED_OWNER_EXISTS', { ledgerKind, ownerCount }));
    return { outcome: 'FAILED', reasonCode: 'VERIFIED_OWNER_EXISTS' };
  }
};
