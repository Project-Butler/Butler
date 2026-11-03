// 권리자 인증(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다. 러너는 fixture와 가짜 함수만 쓴다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import app from '../../../src/app.js';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { requireRegionMember } from '../../../src/middlewares/requireRegionMember.js';
import { encryptField } from '../../../src/platform/fieldCrypto.js';
import { applyOwnershipVerification, endAbandonedUnverifiedOwnerships, expireStaleAttempts, VALIDITY_SETTING_KEY } from '../../../src/platform/ownershipVerification.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { toContractResponse, CONTRACT_INCLUDE } from '../../../src/platform/contractSerializer.js';
import { getOwnershipVerificationSetting, findOwnershipVerificationAttempts, revokeOwnership, updateOwnershipVerificationSetting } from '../../../src/domains/admin/service.js';
import { buildAuthMe, signAccessToken } from '../../../src/domains/auth/service.js';
import { endOwnership } from '../../../src/domains/propertyOwnerships/service.js';
import { ownershipVerificationResultRouter } from '../../../src/domains/ownershipVerifications/router.js';
import { buildSignedHeaders } from '../../../src/domains/ownershipVerifications/runnerSignature.js';
import { createFixtureRunner, FIXTURE_ID_TEXT, FIXTURE_REASON, FIXTURE_WARNING } from '../../../src/domains/ownershipVerifications/runners/fixture.js';
import { createRemoteRunner } from '../../../src/domains/ownershipVerifications/runners/remote.js';
import {
  findAttemptForUser,
  findLatestAttempt,
  findRenewalTargets,
  receiveRunnerResult,
  runAttempt,
  startOwnershipVerification,
} from '../../../src/domains/ownershipVerifications/service.js';

const BIRTH_DATE = '1980-01-01';
const NAME = '김인증테스트';
const REGION = '1135010600';
const JIBUN = { jibunAddress: '서울특별시 노원구 중계동 17 테스트아파트', mainLot: 17, subLot: 0, isMountain: false };
const DAY = 86400000;
const FUTURE = () => new Date(Date.now() + DAY * 365);
const PAST = () => new Date(Date.now() - DAY);

// 실행을 직접 기다리는 fixture 러너 설정.
const inline = () => {
  const pending = [];
  return {
    deps: { selectRunner: () => createFixtureRunner(), schedule: (fn) => pending.push(fn) },
    drain: () => Promise.all(pending.splice(0).map((fn) => fn())),
  };
};

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });

describe('권리자 인증', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const ownershipIds = [];
  let settingBefore = null;

  before(async () => {
    settingBefore = await prisma.platformSetting.findUnique({ where: { key: VALIDITY_SETTING_KEY } });
  });

  after(async () => {
    if (settingBefore) {
      await prisma.platformSetting.update({ where: { key: VALIDITY_SETTING_KEY }, data: { value: settingBefore.value } });
    } else {
      await prisma.platformSetting.deleteMany({ where: { key: VALIDITY_SETTING_KEY } });
    }
    await prisma.auditLog.deleteMany({
      where: { resourceType: 'OWNERSHIP', resourceId: { in: ownershipIds } },
    });
    await fixture.cleanup();
  });

  const createUser = async (name = NAME) => {
    const user = await fixture.createUser();
    // 회원가입 때 받은 생년월일(암호문). 인증은 이 값으로 비교한다.
    await prisma.user.update({ where: { id: user.id }, data: { name, birthDate: encryptField(BIRTH_DATE) } });
    return user;
  };
  let unitSeq = 0;
  const createProperty = async ({ unitNo, complex = {} } = {}) => {
    const created = await fixture.createComplex({ ...JIBUN, ...complex });
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: created.id, buildingNo: '101', unitNo: unitNo ?? `${3000 + unitSeq}00` } });
  };
  // 기본 호수는 00으로 끝난다. fixture 러너는 호 끝 두 자리 91~97을 실패 규칙으로 쓴다.
  // startedAtOffset: 음수면 더 먼저 등록한 것. started_at 순서를 고정한다.
  const own = async (user, property, { startedAtOffset = 0, ...data } = {}) => {
    const ownership = await prisma.ownership.create({
      data: { propertyId: property.id, userId: user.id, startedAt: new Date(Date.now() + startedAtOffset), ...data },
    });
    ownershipIds.push(ownership.id);
    return ownership;
  };
  const input = (ownership) => ({ ownershipId: ownership.id });
  const getAttempt = (id) => prisma.ownershipVerificationAttempt.findUnique({ where: { id } });
  const getOwnership = (id) => prisma.ownership.findUnique({ where: { id } });
  const start = async (user, ownership) => {
    const { deps, drain } = inline();
    const response = await startOwnershipVerification(user, input(ownership), null, deps);
    await drain();
    return { response, attempt: await getAttempt(response.id) };
  };
  // RUNNING 시도를 직접 만든다(발급 없이 결과 경로만 시험).
  const runningAttempt = (user, ownership, data = {}) =>
    prisma.ownershipVerificationAttempt.create({
      data: { ownershipId: ownership.id, requestedBy: user.id, status: 'RUNNING', ...data },
    });
  const matched = { kind: 'OK', ledgerKind: 'UNIT_EXCLUSIVE', owners: [{ name: NAME, birthDate: BIRTH_DATE }] };
  const auditsOf = (ownership, action) => prisma.auditLog.findMany({ where: { resourceType: 'OWNERSHIP', resourceId: ownership.id, action } });
  const activitiesOf = (user, type) => prisma.activity.findMany({ where: { userId: user.id, type } });

  // 원문이 어디에도 없는지. 이름은 사용자 테이블 밖, 생년월일·idText·warnings는 어디에도.
  const assertNoPersonalData = async (user, ownership, attemptId) => {
    const rows = {
      attempt: await getAttempt(attemptId),
      audits: await prisma.auditLog.findMany({ where: { resourceType: 'OWNERSHIP', resourceId: ownership.id } }),
      activities: await prisma.activity.findMany({ where: { userId: user.id } }),
      consents: await prisma.consent.findMany({ where: { userId: user.id } }),
    };
    const text = JSON.stringify(rows);
    for (const raw of [BIRTH_DATE, NAME, FIXTURE_ID_TEXT, FIXTURE_WARNING, FIXTURE_REASON]) assert.ok(!text.includes(raw), raw);
  };

  test('성공: 인증 저장, 만료일, 감사·활동, 응답에 사유 없음, 사용자 행 불변', async () => {
    const user = await createUser();
    const property = await createProperty();
    const ownership = await own(user, property);
    const userBefore = await prisma.user.findUnique({ where: { id: user.id } });

    const { deps, drain } = inline();
    const accepted = await startOwnershipVerification(user, input(ownership), { ip: '127.0.0.1' }, deps);
    assert.equal(accepted.status, 'PENDING');
    assert.deepEqual(Object.keys(accepted).sort(), ['createdAt', 'finishedAt', 'id', 'ownershipId', 'status']);
    await drain();

    const attempt = await getAttempt(accepted.id);
    assert.equal(attempt.status, 'VERIFIED');
    assert.equal(attempt.ledgerKind, 'UNIT_EXCLUSIVE');
    assert.equal(attempt.ownerCount, 1);

    const verified = await getOwnership(ownership.id);
    assert.equal(verified.verificationStatus, 'VERIFIED');
    assert.equal(verified.checkId, accepted.id);
    assert.equal(verified.verificationExpiresAt.getUTCFullYear(), verified.verifiedAt.getUTCFullYear() + 3);

    const consent = await prisma.consent.findFirst({ where: { userId: user.id } });
    assert.equal(consent.type, 'OWNERSHIP_VERIFICATION');
    assert.equal(consent.version, '2026-11-03-member-birth-date');
    assert.equal((await auditsOf(ownership, 'OWNERSHIP_VERIFICATION_REQUESTED')).length, 1);
    assert.equal((await auditsOf(ownership, 'OWNERSHIP_VERIFICATION_APPLIED')).length, 1);
    assert.equal((await activitiesOf(user, 'OWNERSHIP_VERIFICATION_REQUESTED')).length, 1);
    assert.equal((await activitiesOf(user, 'OWNERSHIP_VERIFIED')).length, 1);
    assert.deepEqual(await prisma.user.findUnique({ where: { id: user.id } }), userBefore);
    await assertNoPersonalData(user, ownership, accepted.id);
  });

  test('러너를 쓸 수 없으면 503이고 시도 행이 없다', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty());
    await rejectsWith(startOwnershipVerification(user, input(ownership), null, { selectRunner: () => null }), 'VERIFICATION_RUNNER_UNAVAILABLE');
    assert.equal(await prisma.ownershipVerificationAttempt.count({ where: { ownershipId: ownership.id } }), 0);
    assert.equal(await prisma.consent.count({ where: { userId: user.id } }), 0);
  });

  test('이중 POST는 시도 1건만 만들고 실행도 1번이다', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty());
    const { deps, drain } = inline();
    const scheduled = [];
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        startOwnershipVerification(user, input(ownership), null, {
          ...deps,
          schedule: (fn) => {
            scheduled.push(fn);
          },
        }),
      ),
    );
    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    assert.equal(await prisma.ownershipVerificationAttempt.count({ where: { ownershipId: ownership.id } }), 1);
    assert.equal(scheduled.length, 1);
    await drain();
    await scheduled[0]();
  });

  test('소유 관계 거절: 타인 404, 종료 422, REVOKED 422', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const { deps } = inline();
    const ownership = await own(user, await createProperty());
    await rejectsWith(startOwnershipVerification(stranger, input(ownership), null, deps), 'OWNERSHIP_NOT_FOUND');
    await rejectsWith(startOwnershipVerification(user, { ownershipId: randomUUID() }, null, deps), 'OWNERSHIP_NOT_FOUND');

    const ended = await own(user, await createProperty(), { endedAt: new Date(), endReason: 'SELF_ENDED' });
    await rejectsWith(startOwnershipVerification(user, input(ended), null, deps), 'OWNERSHIP_ENDED');

    const revoked = await own(user, await createProperty(), { verificationStatus: 'REVOKED' });
    await rejectsWith(startOwnershipVerification(user, input(revoked), null, deps), 'VERIFICATION_REVOKED');
    assert.equal(await prisma.ownershipVerificationAttempt.count({ where: { requestedBy: user.id } }), 0);
  });

  test('타인 시도 조회는 404, 응답에 사유가 없다', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const ownership = await own(user, await createProperty({ unitNo: '3991' }));
    const { attempt } = await start(user, ownership);
    assert.equal(attempt.reasonCode, 'NOT_MATCHED');

    await rejectsWith(findAttemptForUser(stranger, attempt.id), 'OWNERSHIP_VERIFICATION_NOT_FOUND');
    assert.equal(await findLatestAttempt(stranger, ownership.id), null);
    const response = await findAttemptForUser(user, attempt.id);
    assert.equal(response.status, 'FAILED');
    assert.ok(!JSON.stringify(response).includes('NOT_MATCHED'));
    assert.equal((await findLatestAttempt(user, ownership.id)).id, attempt.id);
  });

  test('fixture 호실 규칙별 실패 사유, 활동에 사유 없음, 원문 없음', async () => {
    const expected = { 91: 'NOT_MATCHED', 92: 'UNREADABLE', 93: 'ISSUE_FAILED', 94: 'ISSUE_STOPPED', 95: 'ISSUE_INVALID', 96: 'OCR_FAILED', 97: 'INTERNAL' };
    for (const [suffix, reasonCode] of Object.entries(expected)) {
      const user = await createUser();
      const ownership = await own(user, await createProperty({ unitNo: `40${suffix}` }));
      const { attempt } = await start(user, ownership);
      assert.equal(attempt.status, 'FAILED');
      assert.equal(attempt.reasonCode, reasonCode);
      assert.equal((await getOwnership(ownership.id)).verificationStatus, 'UNVERIFIED');
      const [activity] = await activitiesOf(user, 'OWNERSHIP_VERIFICATION_FAILED');
      assert.ok(!JSON.stringify(activity).includes(reasonCode));
      const [failure] = await auditsOf(ownership, 'OWNERSHIP_VERIFICATION_FAILED');
      assert.equal(failure.summary, reasonCode);
      await assertNoPersonalData(user, ownership, attempt.id);
    }
  });

  test('지번을 조립할 수 없는 단지는 NO_JIBUN_ADDRESS', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty({ complex: { jibunAddress: null, mainLot: null } }));
    const { attempt } = await start(user, ownership);
    assert.equal(attempt.reasonCode, 'NO_JIBUN_ADDRESS');
  });

  test('유효한 인증자가 있으면 발급 없이 VERIFIED_OWNER_EXISTS', async () => {
    const first = await createUser();
    const second = await createUser();
    const property = await createProperty();
    await own(first, property, { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() });
    const ownership = await own(second, property);

    const runner = { kind: 'fake', awaitDispatch: true, run: async () => assert.fail('발급하면 안 된다') };
    const response = await startOwnershipVerification(second, input(ownership), null, { selectRunner: () => runner });
    assert.equal(response.status, 'FAILED');
    const attempt = await getAttempt(response.id);
    assert.equal(attempt.reasonCode, 'VERIFIED_OWNER_EXISTS');
  });

  test('먼저 인증한 사람이 소유자다: 나중에 등록해도 인증되고 앞선 미인증 행과 계약은 끝난다', async () => {
    const first = await createUser('먼저등록자');
    const second = await createUser();
    const property = await createProperty();
    const earlier = await own(first, property, { startedAtOffset: -2000 });
    const mine = await own(second, property);

    const { attempt } = await start(second, mine);
    assert.equal(attempt.status, 'VERIFIED');
    assert.equal((await getOwnership(mine.id)).verificationStatus, 'VERIFIED');
    assert.equal((await getOwnership(earlier.id)).endReason, 'SUPERSEDED');
  });

  test('30일이 지난 미인증 등록만 끝난다. 진행 중 시도·인증·최근 등록은 그대로다', async () => {
    const user = await createUser();
    const old = -31 * DAY;
    const abandoned = await own(user, await createProperty(), { startedAtOffset: old });
    const running = await own(user, await createProperty(), { startedAtOffset: old });
    const verified = await own(user, await createProperty(), { startedAtOffset: old, verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() });
    const recent = await own(user, await createProperty(), { startedAtOffset: -29 * DAY });
    const attempt = await runningAttempt(user, running);

    const { ended } = await endAbandonedUnverifiedOwnerships();
    assert.ok(ended >= 1);
    assert.equal((await getOwnership(abandoned.id)).endReason, 'UNVERIFIED_EXPIRED');
    assert.equal((await auditsOf(abandoned, 'OWNERSHIP_ENDED')).length, 1);
    for (const { id } of [running, verified, recent]) assert.equal((await getOwnership(id)).endedAt, null);
    await receiveRunnerResult(attempt.id, { kind: 'ISSUE_FAILED' });
  });

  test('만료된 본인은 뒤 등록자가 있어도 재인증을 시작하고, 실패해도 저장값이 그대로다', async () => {
    const owner = await createUser();
    const later = await createUser();
    const property = await createProperty({ unitNo: '4191' });
    const expiresAt = PAST();
    const ownership = await own(owner, property, { startedAtOffset: 2000, verificationStatus: 'VERIFIED', verifiedAt: PAST(), verificationExpiresAt: expiresAt });
    await own(later, property);

    const { attempt } = await start(owner, ownership);
    assert.equal(attempt.reasonCode, 'NOT_MATCHED');
    const after = await getOwnership(ownership.id);
    assert.equal(after.verificationStatus, 'VERIFIED');
    assert.equal(after.endedAt, null);
    assert.equal(after.verificationExpiresAt.getTime(), expiresAt.getTime());
  });

  test('만료된 이전 소유자와 미인증 행은 SUPERSEDED로 끝난다. 감사·활동에 새 소유자 정보 없음', async () => {
    const oldOwner = await createUser('이전소유자');
    const newOwner = await createUser();
    const bystander = await createUser('뒤등록자');
    const property = await createProperty();
    const oldOwnership = await own(oldOwner, property, { startedAtOffset: -5000, verificationStatus: 'VERIFIED', verificationExpiresAt: PAST() });
    const mine = await own(newOwner, property, { startedAtOffset: -3000 });
    const other = await own(bystander, property);

    const { attempt } = await start(newOwner, mine);
    assert.equal(attempt.status, 'VERIFIED');
    const ended = await getOwnership(oldOwnership.id);
    assert.equal(ended.endReason, 'SUPERSEDED');
    assert.equal((await getOwnership(other.id)).endReason, 'SUPERSEDED');

    const [endAudit] = await auditsOf(oldOwnership, 'OWNERSHIP_ENDED');
    assert.equal(endAudit.summary, 'SUPERSEDED');
    assert.ok(!JSON.stringify(endAudit).includes(newOwner.id));
    const [activity] = await activitiesOf(oldOwner, 'OWNERSHIP_ENDED');
    assert.ok(!JSON.stringify(activity).includes(newOwner.id));
  });

  test('TIMED_OUT 뒤 도착한 결과는 소유 관계를 바꾸지 않는다', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty());
    const attempt = await runningAttempt(user, ownership, { createdAt: new Date(Date.now() - 11 * 60 * 1000) });

    assert.ok((await expireStaleAttempts()) >= 1);
    const timedOut = await getAttempt(attempt.id);
    assert.equal(timedOut.status, 'FAILED');
    assert.equal(timedOut.reasonCode, 'TIMED_OUT');
    assert.equal((await activitiesOf(user, 'OWNERSHIP_VERIFICATION_FAILED')).length, 1);

    assert.deepEqual(await receiveRunnerResult(attempt.id, matched), { accepted: false });
    assert.equal((await applyOwnershipVerification({ attemptId: attempt.id })).outcome, 'IGNORED');
    assert.equal((await getOwnership(ownership.id)).verificationStatus, 'UNVERIFIED');
    assert.equal((await getAttempt(attempt.id)).reasonCode, 'TIMED_OUT');
  });

  test('방치된 PENDING은 조회 때 끝나고, 10분이 안 된 시도는 그대로다', async () => {
    const user = await createUser();
    const stale = await own(user, await createProperty());
    const fresh = await own(user, await createProperty());
    const staleAttempt = await prisma.ownershipVerificationAttempt.create({
      data: { ownershipId: stale.id, requestedBy: user.id, createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const freshAttempt = await runningAttempt(user, fresh);

    const seen = await findAttemptForUser(user, staleAttempt.id);
    assert.equal(seen.status, 'FAILED');
    assert.equal((await getAttempt(freshAttempt.id)).status, 'RUNNING');
    await receiveRunnerResult(freshAttempt.id, { kind: 'ISSUE_FAILED' });
  });

  test('실행 전 조건 갱신: PENDING이 아니면 실행하지 않는다', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty());
    const attempt = await runningAttempt(user, ownership);
    await runAttempt(attempt.id, { run: async () => assert.fail('실행하면 안 된다') });
    assert.equal((await getAttempt(attempt.id)).status, 'RUNNING');
    await receiveRunnerResult(attempt.id, { kind: 'ISSUE_FAILED' });
  });

  test('만료자가 있는 호실에서 두 시도가 경쟁해도 VERIFIED는 1건이고 예외가 없다', async () => {
    const [a, b] = [await createUser(), await createUser()];
    const property = await createProperty();
    // 만료된 재인증자와 다음 등록자. uq_ownership_verified는 저장값 VERIFIED를 보므로 만료 행이 끝나기 전에 저장하면 충돌한다.
    const ownerA = await own(a, property, { startedAtOffset: -2000, verificationStatus: 'VERIFIED', verificationExpiresAt: PAST() });
    const ownerB = await own(b, property);
    const [attemptA, attemptB] = [await runningAttempt(a, ownerA), await runningAttempt(b, ownerB)];

    const results = await Promise.all([receiveRunnerResult(attemptA.id, matched), receiveRunnerResult(attemptB.id, matched)]);
    assert.ok(results.every((result) => result.accepted));

    const statuses = [await getAttempt(attemptA.id), await getAttempt(attemptB.id)];
    assert.equal(statuses.filter((attempt) => attempt.status === 'VERIFIED').length, 1);
    const failed = statuses.find((attempt) => attempt.status === 'FAILED');
    assert.ok(['OWNERSHIP_CHANGED', 'VERIFIED_OWNER_EXISTS'].includes(failed.reasonCode));
    const verifiedCount = await prisma.ownership.count({ where: { propertyId: property.id, endedAt: null, verificationStatus: 'VERIFIED' } });
    assert.equal(verifiedCount, 1);
  });

  test('인덱스 충돌: 롤백 후 별도 트랜잭션에서 VERIFIED_OWNER_EXISTS로 끝난다', async () => {
    const user = await createUser();
    const rival = await createUser();
    const property = await createProperty();
    const mine = await own(user, property);
    const attempt = await runningAttempt(user, mine);

    // 잠금 뒤에 경쟁자가 인증된 상황을 만든다.
    const saveVerified = async (tx, { ownershipId, verifiedAt, expiresAt }) => {
      const data = { verificationStatus: 'VERIFIED', verifiedAt, verificationExpiresAt: expiresAt };
      await tx.ownership.create({ data: { propertyId: property.id, userId: rival.id, ...data } });
      await tx.ownership.update({ where: { id: ownershipId }, data });
    };
    const result = await receiveRunnerResult(attempt.id, matched, { saveVerified });
    assert.deepEqual(result, { accepted: true });

    const failed = await getAttempt(attempt.id);
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.reasonCode, 'VERIFIED_OWNER_EXISTS');
    assert.equal((await getOwnership(mine.id)).verificationStatus, 'UNVERIFIED');
    assert.equal(await prisma.ownership.count({ where: { propertyId: property.id, userId: rival.id } }), 0);
    assert.equal((await auditsOf(mine, 'OWNERSHIP_VERIFICATION_FAILED')).length, 1);
  });

  test('철회 뒤 도착한 결과는 OWNERSHIP_CHANGED, 철회와 동시에 와도 상태가 어긋나지 않는다', async () => {
    const admin = await fixture.createUser('ADMIN');
    const user = await createUser();
    const revokedFirst = await own(user, await createProperty());
    const attempt = await runningAttempt(user, revokedFirst);
    await revokeOwnership(admin, revokedFirst.id, { reason: '테스트' }, null);
    await receiveRunnerResult(attempt.id, matched);
    assert.equal((await getAttempt(attempt.id)).reasonCode, 'OWNERSHIP_CHANGED');
    assert.equal((await getOwnership(revokedFirst.id)).verificationStatus, 'REVOKED');

    const raced = await own(user, await createProperty());
    const racedAttempt = await runningAttempt(user, raced);
    await Promise.all([receiveRunnerResult(racedAttempt.id, matched), revokeOwnership(admin, raced.id, { reason: '테스트' }, null)]);
    // 어느 순서든 철회가 이긴다: 철회가 먼저면 시도 실패, 인증이 먼저면 철회가 덮는다.
    assert.equal((await getOwnership(raced.id)).verificationStatus, 'REVOKED');
  });

  test('앞선 REVOKED 행이 있으면 다음 사람은 NOT_FIRST_REGISTRANT', async () => {
    const [revokedUser, next] = [await createUser(), await createUser()];
    const property = await createProperty();
    await own(revokedUser, property, { startedAtOffset: -2000, verificationStatus: 'REVOKED' });
    const mine = await own(next, property);
    const attempt = await runningAttempt(next, mine);
    await receiveRunnerResult(attempt.id, matched);
    assert.equal((await getAttempt(attempt.id)).reasonCode, 'NOT_FIRST_REGISTRANT');
  });

  test('다른 유효한 인증자가 있으면 VERIFIED_OWNER_EXISTS', async () => {
    const [valid, next] = [await createUser(), await createUser()];
    const property = await createProperty();
    await own(valid, property, { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() });
    const mine = await own(next, property);
    const attempt = await runningAttempt(next, mine);
    await receiveRunnerResult(attempt.id, matched);
    assert.equal((await getAttempt(attempt.id)).reasonCode, 'VERIFIED_OWNER_EXISTS');
  });

  test('회원 생년월일이 없으면 422이고 시도·동의를 남기지 않는다', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { birthDate: null } });
    const ownership = await own(user, await createProperty());
    const { deps } = inline();
    await rejectsWith(startOwnershipVerification(user, input(ownership), null, deps), 'OWNERSHIP_VERIFICATION_BIRTH_DATE_REQUIRED');
    assert.equal(await prisma.ownershipVerificationAttempt.count({ where: { ownershipId: ownership.id } }), 0);
    assert.equal(await prisma.consent.count({ where: { userId: user.id } }), 0);
  });

  test('회원 생년월일 복호화 실패는 INTERNAL', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty());
    const attempt = await runningAttempt(user, ownership);
    await prisma.user.update({ where: { id: user.id }, data: { birthDate: 'enc:v1:00:00:00' } });
    await receiveRunnerResult(attempt.id, matched);
    const failed = await getAttempt(attempt.id);
    assert.equal(failed.reasonCode, 'INTERNAL');
  });

  test('remote: 전송 실패는 ISSUE_FAILED, 성공이면 RUNNING으로 기다린다', async () => {
    const user = await createUser();
    const down = await own(user, await createProperty());
    const failing = createRemoteRunner({ url: 'http://runner', secret: 's', fetchImpl: async () => ({ ok: false }) });
    const failed = await startOwnershipVerification(user, input(down), null, { selectRunner: () => failing });
    assert.equal(failed.status, 'FAILED');
    assert.equal((await getAttempt(failed.id)).reasonCode, 'ISSUE_FAILED');

    const up = await own(user, await createProperty());
    let body;
    const working = createRemoteRunner({
      url: 'http://runner',
      secret: 's',
      fetchImpl: async (_url, init) => {
        body = init.body;
        return { ok: true };
      },
    });
    const accepted = await startOwnershipVerification(user, input(up), null, { selectRunner: () => working });
    assert.equal(accepted.status, 'RUNNING');
    assert.ok(!body.includes(BIRTH_DATE) && !body.includes(NAME));
    await receiveRunnerResult(accepted.id, matched);
    assert.equal((await getAttempt(accepted.id)).status, 'VERIFIED');
  });

  describe('결과 수신 경로', () => {
    const SECRET = randomUUID();
    let server;
    let baseUrl;
    let previousSecret;
    const errors = [];
    const originalError = console.error;

    before(async () => {
      previousSecret = process.env.OWNERSHIP_VERIFICATION_RUNNER_SECRET;
      process.env.OWNERSHIP_VERIFICATION_RUNNER_SECRET = SECRET;
      console.error = (...args) => errors.push(args);
      const app = express();
      app.use('/api/v1/ownership-verifications', ownershipVerificationResultRouter);
      app.use(errorHandler);
      server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/ownership-verifications`;
    });
    after(async () => {
      console.error = originalError;
      if (previousSecret === undefined) delete process.env.OWNERSHIP_VERIFICATION_RUNNER_SECRET;
      else process.env.OWNERSHIP_VERIFICATION_RUNNER_SECRET = previousSecret;
      await new Promise((resolve) => server.close(resolve));
    });

    const post = (attemptId, body, secret = SECRET) =>
      fetch(`${baseUrl}/${attemptId}/result`, { method: 'POST', headers: buildSignedHeaders(secret, body), body });

    test('서명이 맞으면 반영하고, 틀리면 401, 다른 시도의 서명 본문은 400, 원문은 응답·로그에 없다', async () => {
      const user = await createUser();
      const ownership = await own(user, await createProperty());
      const attempt = await runningAttempt(user, ownership);
      const body = JSON.stringify({ attemptId: attempt.id, ...matched });

      assert.equal((await post(attempt.id, body, 'wrong')).status, 401);
      assert.equal((await post(randomUUID(), body)).status, 400);
      assert.equal((await getAttempt(attempt.id)).status, 'RUNNING');

      const withIdText = JSON.stringify({ attemptId: attempt.id, ...matched, idText: FIXTURE_ID_TEXT });
      const rejected = await post(attempt.id, withIdText);
      assert.equal(rejected.status, 400);
      assert.ok(!(await rejected.text()).includes(FIXTURE_ID_TEXT));

      const broken = await post(attempt.id, `{"name":"${NAME}"`);
      assert.equal(broken.status, 400);
      assert.ok(!(await broken.text()).includes(NAME));

      const accepted = await post(attempt.id, body);
      assert.equal(accepted.status, 200);
      const responseText = await accepted.text();
      assert.deepEqual(JSON.parse(responseText), { data: { accepted: true } });
      assert.ok(!responseText.includes(NAME));
      assert.equal((await getAttempt(attempt.id)).status, 'VERIFIED');

      const late = await post(attempt.id, body);
      assert.deepEqual(await late.json(), { data: { accepted: false } });

      const logged = JSON.stringify(errors.map((args) => args.map(String)));
      for (const raw of [NAME, BIRTH_DATE, FIXTURE_ID_TEXT]) assert.ok(!logged.includes(raw));
    });
  });

  describe('실제 앱 경로', () => {
    const saved = {};
    const KEYS = ['OWNERSHIP_VERIFICATION_RUNNER', 'ACCESS_TOKEN_SECRET'];
    let server;
    let baseUrl;
    const userIds = [];

    before(async () => {
      for (const key of KEYS) saved[key] = process.env[key];
      process.env.ACCESS_TOKEN_SECRET ||= randomUUID();
      server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/ownership-verifications`;
    });
    after(async () => {
      for (const key of KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      await new Promise((resolve) => server.close(resolve));
      for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    });

    const request = (user, path, init = {}) =>
      fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Cookie: `access_token=${signAccessToken(user)}`,
          'X-Requested-With': 'butler-web',
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    const postStart = (user, body) => request(user, '', { method: 'POST', body: JSON.stringify(body) });
    const landlord = async () => {
      const user = await createUser();
      userIds.push(user.id);
      return user;
    };

    test('POST: 러너 미설정 503·시도 없음, 동의 없음 400, fixture 202 후 완료, 재인증 대상·최신 조회 경로', async () => {
      const user = await landlord();
      const ownership = await own(user, await createProperty());
      const body = { ...input(ownership), consent: true };

      delete process.env.OWNERSHIP_VERIFICATION_RUNNER;
      const unavailable = await postStart(user, body);
      assert.equal(unavailable.status, 503);
      assert.equal((await unavailable.json()).error.code, 'VERIFICATION_RUNNER_UNAVAILABLE');
      assert.equal(await prisma.ownershipVerificationAttempt.count({ where: { ownershipId: ownership.id } }), 0);

      process.env.OWNERSHIP_VERIFICATION_RUNNER = 'fixture';
      const noConsent = await postStart(user, input(ownership));
      assert.equal(noConsent.status, 400);
      const noConsentText = await noConsent.text();
      assert.ok(!noConsentText.includes(BIRTH_DATE));

      const accepted = await postStart(user, body);
      assert.equal(accepted.status, 202);
      const { data } = await accepted.json();

      let current = data;
      for (let i = 0; i < 50 && current.status !== 'VERIFIED' && current.status !== 'FAILED'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        current = (await (await request(user, `/${data.id}`)).json()).data;
      }
      assert.equal(current.status, 'VERIFIED');

      assert.equal((await (await request(user, `?ownershipId=${ownership.id}`)).json()).data.id, data.id);
      const targets = await request(user, '/renewal-targets');
      assert.equal(targets.status, 200);
      assert.deepEqual((await targets.json()).data, []);
    });

    test('결과 경로는 CSRF 헤더 없이 서명으로 판단하고, 사용자 경로는 인증이 필요하다', async () => {
      const unsigned = await fetch(`${baseUrl}/${randomUUID()}/result`, { method: 'POST', body: '{}' });
      assert.equal(unsigned.status, 401);
      assert.equal((await unsigned.json()).error.code, 'VERIFICATION_RUNNER_SIGNATURE_INVALID');

      assert.equal((await fetch(`${baseUrl}/renewal-targets`)).status, 401);
      const noCsrf = await fetch(baseUrl, { method: 'POST', body: '{}' });
      assert.equal(noCsrf.status, 403);
    });
  });

  test('재인증 대상: 만료 30일 이내·만료만, 끝난 것과 미인증 제외', async () => {
    const user = await createUser();
    const soon = await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: new Date(Date.now() + DAY * 10) });
    const expired = await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST() });
    await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: new Date(Date.now() + DAY * 40) });
    await own(user, await createProperty());
    await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST(), endedAt: new Date(), endReason: 'SELF_ENDED' });

    const targets = await findRenewalTargets(user);
    assert.deepEqual(targets.map((target) => target.id), [expired.id, soon.id]);
    assert.deepEqual(targets.map((target) => target.verificationStatus), ['EXPIRED', 'VERIFIED']);
    assert.ok(targets[0].property.displayName);
  });

  test('소유 종료: SOLD는 계약이 있어도 끝나고, SELF_ENDED는 거절된다. 계약 응답 endReason·landlordVerified', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() });
    const today = new Date();
    const contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        leaseType: 'JEONSE',
        deposit: 1000n,
        monthlyRent: 0n,
        startDate: new Date(today.getTime() - DAY),
        endDate: new Date(today.getTime() + DAY * 300),
        tenantName: '임차인',
        tenantPhone: 'enc-not-used',
      },
    });
    const read = () => prisma.contract.findUnique({ where: { id: contract.id }, include: CONTRACT_INCLUDE });
    const view = (row, viewer) => toContractResponse(row, { viewer, todayKST: new Date().toISOString().slice(0, 10) });
    const active = view(await read(), 'OWNER');
    assert.equal(active.landlordVerified, true);
    assert.equal(active.endReason, null);

    await rejectsWith(endOwnership(user, ownership.id, { reason: null }), 'OWNERSHIP_HAS_ACTIVE_CONTRACTS');
    await rejectsWith(endOwnership(user, ownership.id, { reason: null, endReason: 'SELF_ENDED' }), 'OWNERSHIP_HAS_ACTIVE_CONTRACTS');

    const ended = await endOwnership(user, ownership.id, { reason: '매도', endReason: 'SOLD' });
    assert.equal(ended.endReason, 'SOLD');
    const [auditRow] = await auditsOf(ownership, 'OWNERSHIP_ENDED');
    assert.equal(auditRow.after.endReason, 'SOLD');

    const former = view(await read(), 'FORMER_OWNER');
    assert.equal(former.endReason, 'SOLD');
    assert.equal(former.landlordVerified, false);
    assert.equal(former.isReadOnly, true);
  });

  describe('requireRegionMember', () => {
    const OTHER_REGION = '1168010100';
    const guard = async (user, code) => {
      let received;
      await requireRegionMember(() => code)({ user }, {}, (error) => {
        received = error ?? null;
      });
      return received === null;
    };
    const assertSame = async (user, code, expected) => {
      assert.equal(await guard(user, code), expected);
      const me = await buildAuthMe(await prisma.user.findUnique({ where: { id: user.id } }));
      assert.equal(me.verifiedLegalDongCodes.includes(code), expected);
    };

    test('6경우(인증·미인증·만료·취소·종료·다른 법정동)와 /auth/me 결과가 같다', async () => {
      const cases = [
        [{ verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() }, REGION, true],
        [{}, REGION, false],
        [{ verificationStatus: 'VERIFIED', verificationExpiresAt: PAST() }, REGION, false],
        [{ verificationStatus: 'REVOKED' }, REGION, false],
        [{ verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE(), endedAt: new Date(), endReason: 'SOLD' }, REGION, false],
        [{ verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() }, OTHER_REGION, false],
      ];
      for (const [data, code, expected] of cases) {
        const user = await createUser();
        await own(user, await createProperty(), data);
        await assertSame(user, code, expected);
      }
    });

    test('같은 법정동의 호실 중 하나만 유효해도 쓸 수 있고, 거절은 403 REGION_MEMBERSHIP_REQUIRED', async () => {
      const user = await createUser();
      await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST() });
      await own(user, await createProperty(), { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE() });
      await assertSame(user, REGION, true);

      let received;
      await requireRegionMember(() => OTHER_REGION)({ user }, {}, (error) => {
        received = error;
      });
      assert.equal(received.code, 'REGION_MEMBERSHIP_REQUIRED');
      assert.equal(received.httpStatus, 403);
    });
  });

  test('관리자: 유효기간 수정이 새 인증부터 적용되고 감사가 남는다. 시도 목록에 사유가 있고 암호문은 없다', async () => {
    const admin = await fixture.createUser('ADMIN');
    const before = await getOwnershipVerificationSetting();
    const target = before.validityYears === 5 ? 6 : 5;
    const saved = await updateOwnershipVerificationSetting(admin, { validityYears: target }, null);
    assert.equal(saved.validityYears, target);
    assert.equal((await getOwnershipVerificationSetting()).validityYears, target);
    const auditRow = await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'OWNERSHIP_VERIFICATION_VALIDITY_UPDATED' } });
    assert.equal(auditRow.after.validityYears, target);
    await prisma.auditLog.delete({ where: { id: auditRow.id } });

    const user = await createUser();
    const ownership = await own(user, await createProperty());
    const { attempt } = await start(user, ownership);
    const verified = await getOwnership(ownership.id);
    assert.equal(verified.verificationExpiresAt.getUTCFullYear(), verified.verifiedAt.getUTCFullYear() + target);

    const failing = await own(user, await createProperty({ unitNo: '4291' }));
    const failed = await start(user, failing);
    const { items, meta } = await findOwnershipVerificationAttempts({ reasonCode: 'NOT_MATCHED', ownershipId: failing.id, size: 10 });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, failed.attempt.id);
    assert.equal(items[0].reasonCode, 'NOT_MATCHED');
    assert.equal(items[0].requester.id, user.id);
    assert.equal(meta.hasNext, false);
    assert.equal((await findOwnershipVerificationAttempts({ status: 'VERIFIED', ownershipId: ownership.id, size: 10 })).items[0].id, attempt.id);
  });
});
