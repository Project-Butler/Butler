// 인증 전 하우스 로그(실제 로컬 Postgres + 임시 폴더의 실제 파일). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// H-37: 한 번도 인증하지 않은 소유 관계가 끝나면(사용자·운영자·자동 만료·SUPERSEDED) 기록·첨부가 모두 지워진다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { endOwnershipByAdmin } from '../../../src/domains/admin/service.js';
import { endOwnership } from '../../../src/domains/propertyOwnerships/service.js';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { applyOwnershipVerification, endAbandonedUnverifiedOwnerships } from '../../../src/platform/ownershipVerification.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const DAY = 86400000;
const FUTURE = () => new Date(Date.now() + DAY * 365);
const PAST = () => new Date(Date.now() - DAY);
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL'];

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

const exists = async (filePath) => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

describe('인증 전 하우스 로그', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const ownershipIds = [];
  const saved = {};
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-unverified-logs-'));
    Object.assign(process.env, { STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: 'test-secret', LOCAL_STORAGE_DIR: storageDir });
    delete process.env.VERCEL;
  });

  after(async () => {
    for (const key of STORAGE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { resourceType: 'OWNERSHIP', resourceId: { in: ownershipIds } }] },
    });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    await fixture.cleanup();
    await rm(storageDir, { recursive: true, force: true });
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };
  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '105', unitNo: `${6000 + unitSeq}` } });
  };
  const own = async (user, property, { startedAtOffset = 0, ...data } = {}) => {
    const ownership = await prisma.ownership.create({
      data: { propertyId: property.id, userId: user.id, startedAt: new Date(Date.now() + startedAtOffset), ...data },
    });
    ownershipIds.push(ownership.id);
    return ownership;
  };
  const verifiedOnce = () => ({ verificationStatus: 'VERIFIED', verifiedAt: PAST(), firstVerifiedAt: PAST(), verificationExpiresAt: FUTURE() });

  // 기록 1개 + 실제 파일이 있는 첨부 1개 + 그 기록을 가리키는 티켓 1개.
  const seedLog = async (user, ownership, { scope = 'PRIVATE', type = 'REPAIR', keepPrivate = false } = {}) => {
    const log = await prisma.propertyLog.create({
      data: {
        propertyId: ownership.propertyId,
        ownershipId: ownership.id,
        authorId: type === 'TICKET_SUMMARY' ? null : user.id,
        scope,
        keepPrivate,
        type,
        title: '인증 전 기록',
        occurredOn: new Date(`${getTodayKST()}T00:00:00Z`),
      },
    });
    const uploadId = randomUUID();
    const storagePath = `uploads/${uploadId}`;
    await mkdir(path.join(storageDir, 'uploads'), { recursive: true });
    await writeFile(path.join(storageDir, 'uploads', uploadId), 'photo');
    await prisma.upload.create({
      data: { id: uploadId, userId: user.id, fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 5n, type: 'PHOTO', storagePath, expiresAt: FUTURE(), completedAt: new Date() },
    });
    const document = await prisma.document.create({
      data: {
        uploadId,
        uploaderId: user.id,
        type: 'PHOTO',
        resourceType: 'MANAGEMENT_LOG',
        resourceId: log.id,
        storagePath,
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5n,
        attachedAt: new Date(),
      },
    });
    const ticket = await prisma.ticket.create({
      data: { propertyId: ownership.propertyId, ownershipId: ownership.id, requesterId: user.id, category: 'REPAIR', title: '수리', description: '설명', logId: log.id },
    });
    return { log, document, ticket, filePath: path.join(storageDir, 'uploads', uploadId) };
  };

  const assertRemoved = async (ownership, seeded) => {
    assert.equal(await prisma.propertyLog.count({ where: { ownershipId: ownership.id } }), 0);
    assert.ok((await prisma.document.findUnique({ where: { id: seeded.document.id } })).deletedAt);
    assert.equal(await exists(seeded.filePath), false);
    assert.equal((await prisma.ticket.findUnique({ where: { id: seeded.ticket.id } })).logId, null);
  };

  const assertKept = async (seeded) => {
    assert.equal(await prisma.propertyLog.count({ where: { id: seeded.log.id } }), 1);
    assert.equal((await prisma.document.findUnique({ where: { id: seeded.document.id } })).deletedAt, null);
    assert.equal(await exists(seeded.filePath), true);
    assert.equal((await prisma.ticket.findUnique({ where: { id: seeded.ticket.id } })).logId, seeded.log.id);
  };

  const runningAttempt = (user, ownership) =>
    prisma.ownershipVerificationAttempt.create({ data: { ownershipId: ownership.id, requestedBy: user.id, status: 'RUNNING' } });
  const verifyNow = async (user, ownership) => {
    const attempt = await runningAttempt(user, ownership);
    const applied = await applyOwnershipVerification({ attemptId: attempt.id });
    assert.equal(applied.outcome, 'VERIFIED');
    assert.equal('removedPaths' in applied, false);
    return applied;
  };

  test('H-37 사용자 종료: 인증 전 기록·첨부·파일이 지워지고 티켓 log_id는 비워진다', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty());
    const seeded = await seedLog(user, ownership);
    const ended = await endOwnership(user, ownership.id, { reason: null, endReason: 'SOLD' });
    assert.equal(ended.endReason, 'SOLD');
    await assertRemoved(ownership, seeded);
  });

  test('H-37 운영자 종료: 인증 전 기록이 지워진다', async () => {
    const user = await createUser();
    const admin = await createUser('ADMIN');
    const ownership = await own(user, await createProperty());
    const seeded = await seedLog(user, ownership, { type: 'NOTE', keepPrivate: true });
    await endOwnershipByAdmin(admin, ownership.id, { reason: '테스트' }, null);
    await assertRemoved(ownership, seeded);
  });

  test('H-37 자동 만료(cron): 기간이 지난 미인증 등록의 기록이 지워진다', async () => {
    const user = await createUser();
    const ownership = await own(user, await createProperty(), { startedAtOffset: -31 * DAY });
    const seeded = await seedLog(user, ownership);
    await endAbandonedUnverifiedOwnerships();
    assert.equal((await prisma.ownership.findUnique({ where: { id: ownership.id } })).endReason, 'UNVERIFIED_EXPIRED');
    await assertRemoved(ownership, seeded);
  });

  test('H-37 SUPERSEDED: 다른 사람이 인증하면 앞선 미인증 등록의 기록이 지워진다', async () => {
    const first = await createUser();
    const second = await createUser();
    const property = await createProperty();
    const earlier = await own(first, property, { startedAtOffset: -2000 });
    const mine = await own(second, property);
    const seeded = await seedLog(first, earlier);
    await verifyNow(second, mine);
    assert.equal((await prisma.ownership.findUnique({ where: { id: earlier.id } })).endReason, 'SUPERSEDED');
    await assertRemoved(earlier, seeded);
  });

  test('인증한 적 있는 소유 관계 종료 → 기록이 남는다(사용자 종료, 만료 뒤 SUPERSEDED)', async () => {
    const seller = await createUser();
    const soldOwnership = await own(seller, await createProperty(), verifiedOnce());
    const sold = await seedLog(seller, soldOwnership, { scope: 'PROPERTY_HISTORY' });
    await endOwnership(seller, soldOwnership.id, { reason: null, endReason: 'SOLD' });
    await assertKept(sold);

    const oldOwner = await createUser();
    const newOwner = await createUser();
    const property = await createProperty();
    const lapsed = await own(oldOwner, property, { startedAtOffset: -5000, ...verifiedOnce(), verificationExpiresAt: PAST() });
    const mine = await own(newOwner, property);
    const lapsedLog = await seedLog(oldOwner, lapsed, { scope: 'PROPERTY_HISTORY' });
    await verifyNow(newOwner, mine);
    assert.equal((await prisma.ownership.findUnique({ where: { id: lapsed.id } })).endReason, 'SUPERSEDED');
    await assertKept(lapsedLog);
  });
});
