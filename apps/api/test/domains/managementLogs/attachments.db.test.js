// 관리 로그 사진 첨부(실제 로컬 Postgres + 임시 폴더의 실제 파일). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 첨부 상한, 수정에서 빼기·더하기, 나만 보기 삭제 시 문서 숨김, 소유 종료 후 읽기 전용·잠금.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import {
  createManagementLog,
  deleteManagementLog,
  findManagementLogForUser,
  findManagementLogs,
  updateManagementLog,
} from '../../../src/domains/managementLogs/service.js';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { endOwnershipInTx } from '../../../src/platform/ownershipEnd.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const SECRET = 'test-secret';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF attachment')]);
const FUTURE_EXPIRY = new Date(Date.now() + 86400000 * 365);
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL'];
const LIST_DEFAULTS = { propertyId: null, scope: null, types: [], until: null, sortDirection: 'desc', page: 1, size: 20 };

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('관리 로그 첨부', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-log-attachments-'));
    Object.assign(process.env, { STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: SECRET, LOCAL_STORAGE_DIR: storageDir });
    delete process.env.VERCEL;
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const key of STORAGE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await new Promise((resolve) => server.close(resolve));
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await fixture.cleanup();
    await rm(storageDir, { recursive: true, force: true });
  });

  const landlord = async () => {
    const user = await fixture.createUser('LANDLORD');
    userIds.push(user.id);
    return user;
  };
  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '103', unitNo: `${4000 + unitSeq}` } });
  };
  const own = (user, property, data = {}) => prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...data } });
  const verified = { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE_EXPIRY };
  const logInput = (overrides = {}) => ({ scope: 'PRIVATE', type: 'REPAIR', title: '사진 기록', occurredOn: getTodayKST(), ...overrides });
  const writeLog = (user, property, scope = 'PRIVATE') => createManagementLog(user, property.id, logInput({ scope }));

  const api = (user, pathname, init = {}) =>
    fetch(`${origin}/api/v1${pathname}`, {
      ...init,
      headers: {
        Cookie: `access_token=${signAccessToken(user)}`,
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const json = async (response) => ({ status: response.status, body: response.status === 204 ? null : await response.json() });
  const postJson = async (user, pathname, body) => json(await api(user, pathname, { method: 'POST', body: JSON.stringify(body) }));
  const createSession = (user) =>
    postJson(user, '/files/upload-sessions', { fileName: '사진.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.length, documentType: 'PHOTO' });
  const putContent = (uploadUrl) => fetch(`${origin}${uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: JPEG });
  // 화면과 같은 순서: 세션 → PUT → 등록(resource 없으면 미연결 문서)
  const uploadDocument = async (user, resource = {}) => {
    const session = await createSession(user);
    assert.equal((await putContent(session.body.data.uploadUrl)).status, 204);
    const registered = await postJson(user, '/documents', { uploadSessionId: session.body.data.id, ...resource });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    return registered.body.data;
  };
  const uploadMany = (user, count) => Promise.all(Array.from({ length: count }, () => uploadDocument(user)));
  const storedFiles = async () => {
    try {
      return await readdir(path.join(storageDir, 'uploads'));
    } catch {
      return [];
    }
  };
  const uploadIdOf = async (documentId) => (await prisma.document.findUnique({ where: { id: documentId } })).uploadId;

  test('작성: 미연결 문서를 붙이면 응답·목록·상세에 attachments가 나온다(URL 없음)', async () => {
    const user = await landlord();
    const property = await createProperty();
    await own(user, property);
    const docs = await uploadMany(user, 3);

    const log = await createManagementLog(user, property.id, logInput({ attachmentDocumentIds: docs.map((doc) => doc.id) }));
    assert.equal(log.attachments.length, 3);
    assert.deepEqual(Object.keys(log.attachments[0]).sort(), ['createdAt', 'fileName', 'id', 'isLocked', 'mimeType', 'sizeBytes']);
    assert.equal(log.attachments[0].sizeBytes, JPEG.length);
    assert.equal(log.attachments[0].isLocked, false);

    const detail = await findManagementLogForUser(user, log.id);
    assert.deepEqual(detail.attachments.map((item) => item.id).sort(), docs.map((doc) => doc.id).sort());
    const { items } = await findManagementLogs(user, { ...LIST_DEFAULTS, propertyId: property.id });
    assert.equal(items[0].attachments.length, 3);
    const row = await prisma.document.findUnique({ where: { id: docs[0].id } });
    assert.equal(row.resourceType, 'MANAGEMENT_LOG');
    assert.equal(row.resourceId, log.id);
    assert.ok(row.attachedAt);

    // 이미 붙은 문서는 다른 기록에 못 붙인다
    await rejectsWith(createManagementLog(user, property.id, logInput({ attachmentDocumentIds: [docs[0].id] })), 'DOCUMENT_NOT_FOUND');
  });

  test('작성: 남의 문서를 섞으면 404이고 기록도 만들어지지 않는다', async () => {
    const user = await landlord();
    const other = await landlord();
    const property = await createProperty();
    await own(user, property);
    const mine = await uploadDocument(user);
    const theirs = await uploadDocument(other);
    await rejectsWith(createManagementLog(user, property.id, logInput({ title: '롤백 확인', attachmentDocumentIds: [mine.id, theirs.id] })), 'DOCUMENT_NOT_FOUND');
    assert.equal(await prisma.propertyLog.count({ where: { propertyId: property.id, title: '롤백 확인' } }), 0);
    assert.equal((await prisma.document.findUnique({ where: { id: mine.id } })).resourceType, null);
  });

  test('상한: 기록 하나에 10개까지, POST /documents로 11번째는 422', async () => {
    const user = await landlord();
    const property = await createProperty();
    await own(user, property);
    const docs = await uploadMany(user, 10);
    const log = await createManagementLog(user, property.id, logInput({ attachmentDocumentIds: docs.map((doc) => doc.id) }));
    assert.equal(log.attachments.length, 10);

    const session = await createSession(user);
    await putContent(session.body.data.uploadUrl);
    const over = await postJson(user, '/documents', { uploadSessionId: session.body.data.id, resourceType: 'MANAGEMENT_LOG', resourceId: log.id });
    assert.equal(over.status, 422);
    assert.equal(over.body.error.code, 'ATTACHMENT_LIMIT_EXCEEDED');
  });

  test('수정: 최종 목록으로 맞춘다 — 빠진 문서는 숨기고 파일을 지우며, 새 문서는 붙인다', async () => {
    const user = await landlord();
    const property = await createProperty();
    await own(user, property, verified);
    const [keep, drop] = await uploadMany(user, 2);
    const log = await createManagementLog(user, property.id, logInput({ scope: 'PROPERTY_HISTORY', attachmentDocumentIds: [keep.id, drop.id] }));
    const added = await uploadDocument(user);
    const dropUploadId = await uploadIdOf(drop.id);

    const updated = await updateManagementLog(user, log.id, { attachmentDocumentIds: [keep.id, added.id] });
    assert.deepEqual(updated.attachments.map((item) => item.id).sort(), [keep.id, added.id].sort());
    assert.ok((await prisma.document.findUnique({ where: { id: drop.id } })).deletedAt);
    assert.equal((await storedFiles()).includes(dropUploadId), false);
    const activity = await prisma.activity.findFirst({ where: { userId: user.id, type: 'MANAGEMENT_LOG_UPDATED' } });
    assert.deepEqual(activity.params.fields, ['attachments']);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'MANAGEMENT_LOG_UPDATED', resourceId: log.id } });
    assert.equal(audit.summary, '관리 기록 수정: 첨부');

    // 같은 목록이면 바뀐 것이 없다
    await updateManagementLog(user, log.id, { attachmentDocumentIds: [added.id, keep.id] });
    assert.equal(await prisma.activity.count({ where: { userId: user.id, type: 'MANAGEMENT_LOG_UPDATED' } }), 1);
  });

  test('나만 보기 삭제: 붙은 문서도 숨기고 파일을 지운다', async () => {
    const user = await landlord();
    const property = await createProperty();
    await own(user, property);
    const doc = await uploadDocument(user);
    const log = await createManagementLog(user, property.id, logInput({ attachmentDocumentIds: [doc.id] }));
    const uploadId = await uploadIdOf(doc.id);
    assert.ok((await storedFiles()).includes(uploadId));

    await deleteManagementLog(user, log.id);
    assert.ok((await prisma.document.findUnique({ where: { id: doc.id } })).deletedAt);
    assert.equal((await storedFiles()).includes(uploadId), false);
    assert.equal((await api(user, `/documents/${doc.id}`)).status, 404);
  });

  test('소유 종료: 호실 이력 문서는 잠기고, 끝난 소유의 기록은 첨부를 바꿀 수 없으며, 다음 소유자는 보기만 한다', async () => {
    const seller = await landlord();
    const buyer = await landlord();
    const property = await createProperty();
    const sellerOwnership = await own(seller, property, verified);
    const historyLog = await writeLog(seller, property, 'PROPERTY_HISTORY');
    const privateLog = await writeLog(seller, property, 'PRIVATE');
    const historyDoc = await uploadDocument(seller, { resourceType: 'MANAGEMENT_LOG', resourceId: historyLog.id });
    const privateDoc = await uploadDocument(seller, { resourceType: 'MANAGEMENT_LOG', resourceId: privateLog.id });

    await prisma.$transaction((tx) => endOwnershipInTx(tx, sellerOwnership, { endReason: 'SOLD', note: null, checkActiveContracts: false }));
    assert.equal((await prisma.document.findUnique({ where: { id: historyDoc.id } })).isLocked, true);
    assert.equal((await prisma.document.findUnique({ where: { id: privateDoc.id } })).isLocked, false);

    const locked = await json(await api(seller, `/documents/${historyDoc.id}`, { method: 'DELETE' }));
    assert.equal(locked.status, 422);
    assert.equal(locked.body.error.code, 'DOCUMENT_NOT_DELETABLE');
    // 끝난 소유의 기록은 첨부를 지울 수도 붙일 수도 없다
    assert.equal((await json(await api(seller, `/documents/${privateDoc.id}`, { method: 'DELETE' }))).body.error.code, 'MANAGEMENT_LOG_READ_ONLY');
    const lateSession = await createSession(seller);
    await putContent(lateSession.body.data.uploadUrl);
    const lateAttach = await postJson(seller, '/documents', { uploadSessionId: lateSession.body.data.id, resourceType: 'MANAGEMENT_LOG', resourceId: privateLog.id });
    assert.equal(lateAttach.body.error.code, 'MANAGEMENT_LOG_READ_ONLY');
    await rejectsWith(updateManagementLog(seller, privateLog.id, { attachmentDocumentIds: [] }), 'MANAGEMENT_LOG_READ_ONLY');

    await own(buyer, property, verified);
    const seen = await findManagementLogForUser(buyer, historyLog.id);
    assert.equal(seen.attachments[0].isLocked, true);
    assert.equal((await json(await api(buyer, `/documents/${historyDoc.id}`))).body.data.isLocked, true);
    assert.equal((await postJson(buyer, `/documents/${historyDoc.id}/download-url`, {})).status, 200);
    assert.equal((await json(await api(buyer, `/documents/${historyDoc.id}`, { method: 'DELETE' }))).body.error.code, 'DOCUMENT_NOT_DELETABLE');
    // 넘어가지 않는 나만 보기 기록의 문서는 다음 소유자에게 안 보인다
    assert.equal((await api(buyer, `/documents/${privateDoc.id}`)).status, 404);
  });
});
