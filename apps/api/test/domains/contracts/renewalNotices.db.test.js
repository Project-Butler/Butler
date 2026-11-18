// 갱신 거절 통지 기록(#157) 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { addDaysToDateString, getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { createContract, findContractForUser, terminateContract } from '../../../src/domains/contracts/service.js';
import { createRenewalNotice, deleteRenewalNotice, findRenewalNotices } from '../../../src/domains/contracts/renewalNoticeService.js';
import { getResourcePolicy } from '../../../src/domains/documents/resourcePolicies.js';

const TODAY = getTodayKST();
const shift = (days) => addDaysToDateString(TODAY, days);

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

const noticeInput = (overrides = {}) => ({
  kind: 'REFUSE_RENEWAL',
  method: 'CERTIFIED_MAIL',
  sentOn: shift(-3),
  deliveredOn: shift(-1),
  memo: null,
  attachmentDocumentIds: [],
  ...overrides,
});

describe('갱신 거절 통지 기록', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const savedStorage = {};
  let storageDir;

  before(async () => {
    for (const key of ['STORAGE_DRIVER', 'LOCAL_STORAGE_DIR']) savedStorage[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-renewal-notices-'));
    Object.assign(process.env, { STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: storageDir });
  });

  after(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    const uploads = await prisma.upload.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    await prisma.document.deleteMany({ where: { uploadId: { in: uploads.map((upload) => upload.id) } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    await fixture.cleanup();
    for (const [key, value] of Object.entries(savedStorage)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(storageDir, { recursive: true, force: true });
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  let unitSeq = 0;
  // 오늘이 통지 구간 안이 되도록 만료일을 100일 뒤로 둔 진행 중 계약
  const createContractFor = async (user, { endDate = shift(100) } = {}) => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${2000 + unitSeq}` } });
    const verified = { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verificationExpiresAt: new Date(Date.now() + 86400000 * 365) };
    const ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...verified } });
    const contract = await createContract(user, {
      ownershipId: ownership.id,
      leaseType: 'MONTHLY',
      deposit: 10000000n,
      monthlyRent: 500000n,
      startDate: shift(-600),
      endDate,
      tenantName: '이임차',
      tenantPhone: '01098765432',
      previousContractId: null,
      memo: null,
    });
    return { contract, ownership };
  };

  const insertUnattachedDocument = async (user) => {
    const upload = await prisma.upload.create({
      data: {
        userId: user.id,
        fileName: '내용증명.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10n,
        type: 'OTHER',
        storagePath: `uploads/${randomUUID()}`,
        expiresAt: new Date(Date.now() + 86400000),
        completedAt: new Date(),
      },
    });
    return prisma.document.create({
      data: {
        uploadId: upload.id,
        uploaderId: user.id,
        type: upload.type,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
      },
    });
  };

  test('계약 응답에 통지 구간이 나오고, 기록하면 최근 통지와 기한 안 도달이 바뀐다', async () => {
    const user = await createUser();
    const { contract } = await createContractFor(user);
    assert.equal(contract.renewalNotice.phase, 'OPEN');
    assert.equal(contract.renewalNotice.hasDeliveredInTime, false);
    assert.equal(contract.renewalNotice.latestNotice, null);

    const notice = await createRenewalNotice(user, contract.id, noticeInput());
    assert.equal(notice.timing, 'IN_TIME');
    assert.equal(notice.deliveredOn, shift(-1));

    const view = await findContractForUser(user, contract.id);
    assert.equal(view.renewalNotice.hasDeliveredInTime, true);
    assert.equal(view.renewalNotice.latestNotice.id, notice.id);
    assert.equal(await prisma.auditLog.count({ where: { actorId: user.id, action: 'RENEWAL_NOTICE_RECORDED' } }), 1);
  });

  test('도달일이 없으면 UNCONFIRMED, 마감 뒤 도달은 LATE', async () => {
    const user = await createUser();
    // 만료 50일 뒤 → 마감(2개월 전)이 이미 지났다
    const { contract } = await createContractFor(user, { endDate: shift(50) });
    assert.equal(contract.renewalNotice.phase, 'CLOSED');
    const late = await createRenewalNotice(user, contract.id, noticeInput());
    const unconfirmed = await createRenewalNotice(user, contract.id, noticeInput({ deliveredOn: null }));
    assert.equal(late.timing, 'LATE');
    assert.equal(unconfirmed.timing, 'UNCONFIRMED');
    const list = await findRenewalNotices(user, contract.id);
    assert.deepEqual(list.map((item) => item.id), [unconfirmed.id, late.id]);
  });

  test('증빙을 붙이고, 기록을 지우면 증빙도 숨긴다', async () => {
    const user = await createUser();
    const { contract } = await createContractFor(user);
    const document = await insertUnattachedDocument(user);
    const notice = await createRenewalNotice(user, contract.id, noticeInput({ attachmentDocumentIds: [document.id] }));
    assert.deepEqual(notice.attachments.map((item) => item.id), [document.id]);
    assert.equal(await getResourcePolicy('RENEWAL_NOTICE').canView(user, notice.id), true);

    await deleteRenewalNotice(user, contract.id, notice.id);
    assert.equal(await prisma.renewalNotice.count({ where: { id: notice.id } }), 0);
    const hidden = await prisma.document.findUnique({ where: { id: document.id } });
    assert.notEqual(hidden.deletedAt, null);
  });

  test('남의 계약·임차인은 404, 다른 계약의 기록 id는 404', async () => {
    const owner = await createUser();
    const other = await createUser();
    const tenant = await createUser('TENANT');
    const { contract } = await createContractFor(owner);
    const { contract: otherContract } = await createContractFor(owner);
    await prisma.contract.update({ where: { id: contract.id }, data: { tenantId: tenant.id } });
    const notice = await createRenewalNotice(owner, contract.id, noticeInput());

    await rejectsWith(findRenewalNotices(other, contract.id), 'CONTRACT_NOT_FOUND');
    await rejectsWith(findRenewalNotices(tenant, contract.id), 'CONTRACT_NOT_FOUND');
    await rejectsWith(createRenewalNotice(other, contract.id, noticeInput()), 'CONTRACT_NOT_FOUND');
    await rejectsWith(deleteRenewalNotice(owner, otherContract.id, notice.id), 'RENEWAL_NOTICE_NOT_FOUND');
    assert.equal(await getResourcePolicy('RENEWAL_NOTICE').canView(other, notice.id), false);
    // 임차인에게는 계약 응답의 renewalNotice도 null이다
    const tenantView = await findContractForUser(tenant, contract.id);
    assert.equal(tenantView.renewalNotice, null);
  });

  test('해지한 계약과 소유가 끝난 호실은 기록할 수 없고(422), 이전 소유자는 목록을 본다', async () => {
    const user = await createUser();
    const { contract } = await createContractFor(user);
    await terminateContract(user, contract.id, { terminatedOn: TODAY, reason: null });
    await rejectsWith(createRenewalNotice(user, contract.id, noticeInput()), 'CONTRACT_READ_ONLY');

    const { contract: second, ownership } = await createContractFor(user);
    const notice = await createRenewalNotice(user, second.id, noticeInput());
    // 진행 중 계약이 있으면 소유 종료 API가 막으므로(OWNERSHIP_HAS_ACTIVE_CONTRACTS) 끝난 상태를 직접 만든다.
    await prisma.ownership.update({ where: { id: ownership.id }, data: { endedAt: new Date(), endReason: 'SOLD' } });
    await rejectsWith(createRenewalNotice(user, second.id, noticeInput()), 'CONTRACT_READ_ONLY');
    await rejectsWith(deleteRenewalNotice(user, second.id, notice.id), 'CONTRACT_READ_ONLY');
    assert.deepEqual((await findRenewalNotices(user, second.id)).map((item) => item.id), [notice.id]);
  });
});
