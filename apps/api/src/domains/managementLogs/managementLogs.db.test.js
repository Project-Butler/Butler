// 관리 로그 API 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { getTodayKST } from '../../platform/dateUtils.js';
import { prisma } from '../../platform/prismaClient.js';
import { appendPropertyHistory } from '../../platform/propertyHistory.js';
import {
  createManagementLog,
  deleteManagementLog,
  findManagementLogForUser,
  findManagementLogs,
  findPropertyManagementLogs,
  updateManagementLog,
} from './service.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const FUTURE_EXPIRY = new Date(Date.now() + 86400000 * 365);
const PAST_EXPIRY = new Date(Date.now() - 86400000);

const logInput = (overrides = {}) => ({
  scope: 'PRIVATE',
  type: 'REPAIR',
  title: '욕실 배수구 교체',
  content: '배수구 트랩 교체',
  occurredOn: TODAY,
  cost: 350000n,
  ...overrides,
});

const LIST_DEFAULTS = { propertyId: null, scope: null, types: [], until: null, sortDirection: 'desc', page: 1, size: 20 };

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('관리 로그 서비스', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const testUserIds = [];
  const createUser = async (role) => {
    const user = await fixture.createUser(role);
    testUserIds.push(user.id);
    return user;
  };
  after(async () => {
    await prisma.auditLog.deleteMany({ where: { resourceType: 'MANAGEMENT_LOG', actorId: { in: testUserIds } } });
    await fixture.cleanup();
  });

  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${2000 + unitSeq}` } });
  };
  const verified = { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE_EXPIRY };
  const own = (user, property, data = {}) =>
    prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...data } });
  const endOwnership = (ownership) =>
    prisma.ownership.update({ where: { id: ownership.id }, data: { endedAt: new Date(), endReason: 'SELF_ENDED' } });
  const activityCount = (user, type) => prisma.activity.count({ where: { userId: user.id, type } });

  test('나만 보기 작성 → 응답 모양, 활동 1행', async () => {
    const user = await createUser();
    const property = await createProperty();
    await own(user, property);
    const log = await createManagementLog(user, property.id, logInput());
    assert.equal(log.propertyId, property.id);
    assert.equal(log.property.id, property.id);
    assert.equal(log.scope, 'PRIVATE');
    assert.equal(log.cost, 350000);
    assert.equal(log.occurredOn, TODAY);
    assert.equal(log.author.id, user.id);
    assert.deepEqual(log.source, { feature: 'platform', resourceType: null, resourceId: null });
    assert.deepEqual(log.attachments, []);
    assert.equal(log.isReadOnly, false);
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_CREATED'), 1);
  });

  test('R-03: 내 활성 소유가 아닌 호실에 작성 → 404, 활동 없음', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const property = await createProperty();
    await own(stranger, property);
    await rejectsWith(createManagementLog(user, property.id, logInput()), 'PROPERTY_NOT_FOUND');
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_CREATED'), 0);
  });

  test('R-04: 미인증·만료 소유자의 호실 이력 → 403, 인증 소유자 → 201', async () => {
    const user = await createUser();
    const unverifiedUnit = await createProperty();
    await own(user, unverifiedUnit);
    await rejectsWith(createManagementLog(user, unverifiedUnit.id, logInput({ scope: 'PROPERTY_HISTORY' })), 'OWNERSHIP_VERIFICATION_REQUIRED');

    const expiredUnit = await createProperty();
    await own(user, expiredUnit, { verificationStatus: 'VERIFIED', verificationExpiresAt: PAST_EXPIRY });
    await rejectsWith(createManagementLog(user, expiredUnit.id, logInput({ scope: 'PROPERTY_HISTORY' })), 'OWNERSHIP_VERIFICATION_REQUIRED');

    const verifiedUnit = await createProperty();
    await own(user, verifiedUnit, verified);
    const log = await createManagementLog(user, verifiedUnit.id, logInput({ scope: 'PROPERTY_HISTORY' }));
    assert.equal(log.scope, 'PROPERTY_HISTORY');
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_CREATED'), 1);
  });

  test('보이는 범위: 소유자가 바뀌면 호실 이력만 넘어가고, 새 소유자가 인증 전이면 0건', async () => {
    const seller = await createUser();
    const property = await createProperty();
    const sellerOwnership = await own(seller, property, verified);
    const history = await createManagementLog(seller, property.id, logInput({ scope: 'PROPERTY_HISTORY', title: '이력' }));
    const secret = await createManagementLog(seller, property.id, logInput({ title: '비공개' }));
    await endOwnership(sellerOwnership);

    const buyer = await createUser();
    const buyerOwnership = await own(buyer, property);
    const before = await findPropertyManagementLogs(buyer, property.id, LIST_DEFAULTS);
    assert.equal(before.meta.total, 0);
    assert.equal(await findManagementLogForUser(buyer, history.id), null);

    await prisma.ownership.update({ where: { id: buyerOwnership.id }, data: verified });
    const after_ = await findPropertyManagementLogs(buyer, property.id, LIST_DEFAULTS);
    assert.deepEqual(after_.items.map((log) => log.id), [history.id]);
    assert.equal(after_.items[0].author, null);
    assert.equal(after_.items[0].isReadOnly, true);
    assert.equal(await findManagementLogForUser(buyer, secret.id), null);
    await rejectsWith(updateManagementLog(buyer, history.id, { title: '위조' }), 'MANAGEMENT_LOG_NOT_FOUND');

    const sellerView = await findPropertyManagementLogs(seller, property.id, LIST_DEFAULTS);
    assert.equal(sellerView.meta.total, 2);
    assert.ok(sellerView.items.every((log) => log.isReadOnly));
  });

  test('운영자는 호실 기록을 보되 작성자는 보이지 않는다', async () => {
    const user = await createUser();
    const admin = await createUser('ADMIN');
    const property = await createProperty();
    await own(user, property);
    const log = await createManagementLog(user, property.id, logInput());
    const list = await findPropertyManagementLogs(admin, property.id, LIST_DEFAULTS);
    assert.equal(list.items[0].id, log.id);
    assert.equal(list.items[0].author, null);
    assert.equal(list.items[0].isReadOnly, true);
  });

  test('호실 목록: 관계 없는 임대인은 404', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const property = await createProperty();
    await own(user, property);
    await rejectsWith(findPropertyManagementLogs(stranger, property.id, LIST_DEFAULTS), 'PROPERTY_NOT_FOUND');
  });

  test('R-06·D-13: 소유 종료 뒤 수정은 422, 나만 보기 삭제는 된다', async () => {
    const user = await createUser();
    const property = await createProperty();
    const ownership = await own(user, property);
    const log = await createManagementLog(user, property.id, logInput());
    await endOwnership(ownership);
    await rejectsWith(updateManagementLog(user, log.id, { title: '수정' }), 'MANAGEMENT_LOG_READ_ONLY');
    await deleteManagementLog(user, log.id);
    assert.equal(await prisma.propertyLog.count({ where: { id: log.id } }), 0);
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_DELETED'), 1);
  });

  test('R-07: 호실 이력 삭제 → 422', async () => {
    const user = await createUser();
    const property = await createProperty();
    await own(user, property, verified);
    const log = await createManagementLog(user, property.id, logInput({ scope: 'PROPERTY_HISTORY' }));
    await rejectsWith(deleteManagementLog(user, log.id), 'MANAGEMENT_LOG_NOT_DELETABLE');
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_DELETED'), 0);
  });

  test('R-05: 남의 기록 수정·삭제 → 404', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const property = await createProperty();
    await own(user, property);
    const log = await createManagementLog(user, property.id, logInput());
    await rejectsWith(updateManagementLog(stranger, log.id, { title: '수정' }), 'MANAGEMENT_LOG_NOT_FOUND');
    await rejectsWith(deleteManagementLog(stranger, log.id), 'MANAGEMENT_LOG_NOT_FOUND');
    assert.equal(await findManagementLogForUser(stranger, log.id), null);
  });

  test('D-04: 호실 이력 수정은 감사 로그 1행, 값 없음. 나만 보기 수정은 0행', async () => {
    const user = await createUser();
    const property = await createProperty();
    await own(user, property, verified);
    const history = await createManagementLog(user, property.id, logInput({ scope: 'PROPERTY_HISTORY' }));
    const updated = await updateManagementLog(user, history.id, { title: '바뀐 제목값', content: '바뀐 내용값', cost: 777n }, { requestId: randomUUID(), ip: '127.0.0.1' });
    assert.equal(updated.title, '바뀐 제목값');
    assert.equal(updated.cost, 777);

    const rows = await prisma.auditLog.findMany({ where: { resourceType: 'MANAGEMENT_LOG', resourceId: history.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'MANAGEMENT_LOG_UPDATED');
    assert.equal(rows[0].summary, '관리 기록 수정: 제목, 내용, 비용');
    assert.equal(rows[0].before, null);
    assert.equal(rows[0].after, null);
    assert.doesNotMatch(JSON.stringify(rows[0]), /바뀐 제목값|바뀐 내용값|777|욕실/);

    const privateLog = await createManagementLog(user, property.id, logInput());
    await updateManagementLog(user, privateLog.id, { title: '수정' });
    assert.equal(await prisma.auditLog.count({ where: { resourceType: 'MANAGEMENT_LOG', resourceId: privateLog.id } }), 0);
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_UPDATED'), 2);
  });

  test('D-16: 인증이 끊긴 작성자의 호실 이력 수정 → 403, 응답 isReadOnly, 감사·활동 없음', async () => {
    const user = await createUser();
    const property = await createProperty();
    const ownership = await own(user, property, verified);
    const log = await createManagementLog(user, property.id, logInput({ scope: 'PROPERTY_HISTORY' }));
    await prisma.ownership.update({ where: { id: ownership.id }, data: { verificationExpiresAt: PAST_EXPIRY } });

    await rejectsWith(updateManagementLog(user, log.id, { title: '수정' }), 'OWNERSHIP_VERIFICATION_REQUIRED');
    assert.equal((await findManagementLogForUser(user, log.id)).isReadOnly, true);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: log.id } }), 0);
    assert.equal(await activityCount(user, 'MANAGEMENT_LOG_UPDATED'), 0);
  });

  test('D-09·D-10·정렬: 미래 날짜 작성, until·type 필터, 여러 호실 날짜 내림차순, 남의 나만 보기 없음', async () => {
    const user = await createUser();
    const other = await createUser();
    const unitA = await createProperty();
    const unitB = await createProperty();
    await own(user, unitA);
    await own(user, unitB);
    await own(other, await createProperty());
    const tomorrow = await createManagementLog(user, unitA.id, logInput({ occurredOn: shift(1), title: '예정', type: 'INSPECTION' }));
    const yesterday = await createManagementLog(user, unitB.id, logInput({ occurredOn: shift(-1), title: '어제' }));
    const today = await createManagementLog(user, unitA.id, logInput({ title: '오늘', type: 'NOTE' }));

    const all = await findManagementLogs(user, LIST_DEFAULTS);
    assert.deepEqual(all.items.map((log) => log.id), [tomorrow.id, today.id, yesterday.id]);
    const untilToday = await findManagementLogs(user, { ...LIST_DEFAULTS, until: TODAY });
    assert.deepEqual(untilToday.items.map((log) => log.id), [today.id, yesterday.id]);
    const typed = await findManagementLogs(user, { ...LIST_DEFAULTS, types: ['REPAIR', 'NOTE'] });
    assert.deepEqual(typed.items.map((log) => log.id), [today.id, yesterday.id]);
    const byUnit = await findManagementLogs(user, { ...LIST_DEFAULTS, propertyId: unitB.id });
    assert.deepEqual(byUnit.items.map((log) => log.id), [yesterday.id]);
    const ascending = await findManagementLogs(user, { ...LIST_DEFAULTS, sortDirection: 'asc' });
    assert.equal(ascending.items[0].id, yesterday.id);
    assert.equal((await findManagementLogs(other, LIST_DEFAULTS)).meta.total, 0);
  });

  test('appendPropertyHistory: 인증이면 호실 이력, 아니면 나만 보기. 작성자 없음. 시스템 기록은 수정·삭제 불가', async () => {
    const user = await createUser();
    const verifiedUnit = await createProperty();
    const verifiedOwnership = await own(user, verifiedUnit, verified);
    const plainUnit = await createProperty();
    const plainOwnership = await own(user, plainUnit);
    const summary = {
      type: 'TICKET_SUMMARY',
      title: '수전 교체',
      content: '카트리지 교체',
      occurredOn: TODAY,
      cost: 120000n,
      source: { feature: 'platform', resourceType: 'TICKET', resourceId: verifiedUnit.id },
    };
    const history = await appendPropertyHistory({ ...summary, propertyId: verifiedUnit.id, ownershipId: verifiedOwnership.id });
    assert.equal(history.scope, 'PROPERTY_HISTORY');
    assert.equal(history.authorId, null);

    const privateLog = await prisma.$transaction((tx) =>
      appendPropertyHistory({ ...summary, propertyId: plainUnit.id, ownershipId: plainOwnership.id, client: tx }),
    );
    assert.equal(privateLog.scope, 'PRIVATE');

    const view = await findManagementLogForUser(user, privateLog.id);
    assert.equal(view.author, null);
    assert.equal(view.isReadOnly, true);
    assert.equal(view.source.resourceType, 'TICKET');
    await rejectsWith(updateManagementLog(user, privateLog.id, { title: '수정' }), 'MANAGEMENT_LOG_READ_ONLY');
    await rejectsWith(deleteManagementLog(user, privateLog.id), 'MANAGEMENT_LOG_NOT_DELETABLE');
  });
});
