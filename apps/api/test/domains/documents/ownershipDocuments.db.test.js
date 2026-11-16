// OWNERSHIP(내 소유 서류) 문서 권한. RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다. 소유 관계·인증 상태는 Prisma로 직접 만든다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { lockOwnershipRow } from '../../../src/platform/ownershipLock.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const SECRET = 'test-secret';
const PDF = Buffer.from('%PDF-1.7\n테스트 등기부');
const DAY_MS = 86400000;
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL'];
const clearStorageContentLimits = () => prisma.rateLimit.deleteMany({ where: { id: { startsWith: 'storage-content:' } } });
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

describe('OWNERSHIP 문서 권한', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-ownership-documents-'));
    Object.assign(process.env, { STORAGE_DRIVER: 'local', STORAGE_SIGNING_SECRET: SECRET, LOCAL_STORAGE_DIR: storageDir });
    delete process.env.VERCEL;
    await clearStorageContentLimits();
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
    // 증빙 연결(ownership.evidenceDocumentId)이 문서를 참조하므로 소유 관계 지우기 전에 문서를 지우지 않는다.
    await prisma.ownership.updateMany({ where: { userId: { in: userIds } }, data: { evidenceDocumentId: null } });
    const documents = await prisma.document.findMany({ where: { uploaderId: { in: userIds } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: documents.map((d) => d.id) } }] } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await clearStorageContentLimits();
    await fixture.cleanup();
    await rm(storageDir, { recursive: true, force: true });
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };
  let unitSeq = 0;
  // 호실·소유 관계를 만든다. verification: 'VERIFIED' | 'EXPIRED'(만료된 인증) | 'UNVERIFIED' | 'REVOKED'
  const createOwnership = async (owner, { verification = 'VERIFIED', ended = false } = {}) => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '105', unitNo: `${5000 + unitSeq}` } });
    const verified = verification === 'VERIFIED' || verification === 'EXPIRED';
    return prisma.ownership.create({
      data: {
        propertyId: property.id,
        userId: owner.id,
        verificationStatus: verified ? 'VERIFIED' : verification,
        ...(verified ? { verifiedAt: daysFromNow(-10), verificationExpiresAt: daysFromNow(verification === 'EXPIRED' ? -1 : 365) } : {}),
        ...(ended ? { endedAt: new Date(), endReason: 'SOLD' } : {}),
      },
    });
  };
  // 업로드 없이 붙은 문서 행을 바로 만든다.
  const insertDocument = async (user, ownership, type = 'REGISTRY_CERTIFICATE') => {
    const upload = await prisma.upload.create({
      data: {
        userId: user.id,
        fileName: '등기부.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(PDF.length),
        type,
        storagePath: `uploads/${randomUUID()}`,
        expiresAt: daysFromNow(1),
        completedAt: new Date(),
      },
    });
    return prisma.document.create({
      data: {
        uploadId: upload.id,
        uploaderId: user.id,
        type,
        resourceType: 'OWNERSHIP',
        resourceId: ownership.id,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        attachedAt: new Date(),
      },
    });
  };

  const api = (user, pathname, init = {}) =>
    fetch(`${origin}/api/v1${pathname}`, {
      ...init,
      headers: {
        ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}),
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const json = async (response) => ({ status: response.status, body: response.status === 204 ? null : await response.json() });
  const postJson = async (user, pathname, body) => json(await api(user, pathname, { method: 'POST', body: JSON.stringify(body) }));
  const getJson = async (user, pathname) => json(await api(user, pathname));
  const deleteDocument = async (user, documentId) => json(await api(user, `/documents/${documentId}`, { method: 'DELETE' }));
  const listOwnershipDocuments = (user, ownership) => getJson(user, `/documents?resourceType=OWNERSHIP&resourceId=${ownership.id}`);

  const createSession = async (user, documentType) => {
    const session = await postJson(user, '/files/upload-sessions', {
      fileName: '등기부.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      documentType,
    });
    assert.equal(session.status, 201);
    const put = await fetch(`${origin}${session.body.data.uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: PDF });
    assert.equal(put.status, 204);
    return session.body.data.id;
  };
  // 올리고 소유 관계에 붙인다. 등록 응답(status·body)을 그대로 돌려준다.
  const uploadToOwnership = async (user, ownership, documentType = 'REGISTRY_CERTIFICATE') =>
    postJson(user, '/documents', { uploadSessionId: await createSession(user, documentType), resourceType: 'OWNERSHIP', resourceId: ownership.id });

  test('A-1 인증된 활성 소유자: 올리기 201, 목록·상세·다운로드 200', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord);
    const registered = await uploadToOwnership(landlord, ownership);
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.equal(registered.body.data.resourceType, 'OWNERSHIP');
    const list = await listOwnershipDocuments(landlord, ownership);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((item) => item.id), [registered.body.data.id]);
    assert.equal((await getJson(landlord, `/documents/${registered.body.data.id}`)).status, 200);
    assert.equal((await postJson(landlord, `/documents/${registered.body.data.id}/download-url`, {})).status, 200);
  });

  test('A-2 다른 임대인·임차인·ADMIN은 404(허용 종류로 올려도 종류 422가 아니라 404)', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord);
    const document = await insertDocument(landlord, ownership);
    for (const role of ['LANDLORD', 'TENANT']) {
      const stranger = await createUser(role);
      const upload = await uploadToOwnership(stranger, ownership, 'REGISTRY_CERTIFICATE');
      assert.equal(upload.status, 404, role);
      assert.equal(upload.body.error.code, 'OWNERSHIP_NOT_FOUND');
      assert.equal((await listOwnershipDocuments(stranger, ownership)).status, 404);
      assert.equal((await getJson(stranger, `/documents/${document.id}`)).status, 404);
      assert.equal((await postJson(stranger, `/documents/${document.id}/download-url`, {})).status, 404);
    }
    const admin = await createUser('ADMIN');
    assert.equal((await listOwnershipDocuments(admin, ownership)).status, 404);
    assert.equal((await getJson(admin, `/documents/${document.id}`)).status, 404);
  });

  test('A-3 소유 종료 뒤: 열람 200·올리기 422 OWNERSHIP_ENDED·올린 본인 삭제 204·남이 올린 문서 삭제 422', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord);
    const mine = await insertDocument(landlord, ownership);
    const other = await createUser();
    const others = await insertDocument(other, ownership);
    await prisma.ownership.update({ where: { id: ownership.id }, data: { endedAt: new Date(), endReason: 'SOLD' } });

    assert.equal((await listOwnershipDocuments(landlord, ownership)).status, 200);
    assert.equal((await postJson(landlord, `/documents/${mine.id}/download-url`, {})).status, 200);
    const rejected = await uploadToOwnership(landlord, ownership);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'OWNERSHIP_ENDED');

    const forbidden = await deleteDocument(landlord, others.id);
    assert.equal(forbidden.status, 422);
    assert.equal(forbidden.body.error.code, 'DOCUMENT_NOT_DELETABLE');
    assert.equal((await deleteDocument(landlord, mine.id)).status, 204);
  });

  test('A-4 31번째 올리기는 422 ATTACHMENT_LIMIT_EXCEEDED', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord);
    for (let index = 0; index < 30; index += 1) await insertDocument(landlord, ownership);
    const rejected = await uploadToOwnership(landlord, ownership);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'ATTACHMENT_LIMIT_EXCEEDED');
  });

  test('A-5 OWNERSHIP에는 허용 종류만(RECEIPT 422), 허용 종류는 201', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord);
    for (const type of ['REGISTRY_CERTIFICATE', 'SALE_CONTRACT', 'INSURANCE', 'OTHER']) {
      assert.equal((await uploadToOwnership(landlord, ownership, type)).status, 201, type);
    }
    const rejected = await uploadToOwnership(landlord, ownership, 'RECEIPT');
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'DOCUMENT_TYPE_NOT_ALLOWED');
  });

  test('A-6 미인증·철회 활성 소유자 올리기는 403 OWNERSHIP_VERIFICATION_REQUIRED', async () => {
    const landlord = await createUser();
    for (const verification of ['UNVERIFIED', 'REVOKED']) {
      const ownership = await createOwnership(landlord, { verification });
      const rejected = await uploadToOwnership(landlord, ownership);
      assert.equal(rejected.status, 403, verification);
      assert.equal(rejected.body.error.code, 'OWNERSHIP_VERIFICATION_REQUIRED');
    }
  });

  test('A-7 인증 만료: 올리기 403, 목록·다운로드 200, 본인 삭제 204', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord, { verification: 'EXPIRED' });
    const document = await insertDocument(landlord, ownership);
    const rejected = await uploadToOwnership(landlord, ownership);
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error.code, 'OWNERSHIP_VERIFICATION_REQUIRED');
    assert.equal((await listOwnershipDocuments(landlord, ownership)).status, 200);
    assert.equal((await postJson(landlord, `/documents/${document.id}/download-url`, {})).status, 200);
    assert.equal((await deleteDocument(landlord, document.id)).status, 204);
  });

  test('A-8 소유 종료와 올리기가 겹쳐도 종료 뒤 시각에 붙은 문서는 없다', async () => {
    const landlord = await createUser();
    for (let round = 0; round < 3; round += 1) {
      const ownership = await createOwnership(landlord);
      const sessionId = await createSession(landlord, 'REGISTRY_CERTIFICATE');
      let endedAt;
      const ending = prisma.$transaction(async (tx) => {
        await lockOwnershipRow(tx, ownership.id);
        endedAt = new Date();
        await tx.ownership.update({ where: { id: ownership.id }, data: { endedAt, endReason: 'SOLD' } });
      });
      const [, upload] = await Promise.all([
        ending,
        postJson(landlord, '/documents', { uploadSessionId: sessionId, resourceType: 'OWNERSHIP', resourceId: ownership.id }),
      ]);
      assert.ok([201, 422].includes(upload.status), String(upload.status));
      const documents = await prisma.document.findMany({ where: { resourceType: 'OWNERSHIP', resourceId: ownership.id } });
      for (const document of documents) assert.ok(document.attachedAt <= endedAt);
      if (upload.status === 422) assert.equal(documents.length, 0);
    }
  });

  test('A-9 삭제 허용이 올리기로 새지 않는다: 끝난 소유에는 올릴 수 없다', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord, { ended: true });
    const rejected = await uploadToOwnership(landlord, ownership);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'OWNERSHIP_ENDED');
    assert.equal(await prisma.document.count({ where: { resourceType: 'OWNERSHIP', resourceId: ownership.id } }), 0);
  });

  test('증빙으로 연결된 문서는 GET /documents·단건에서 숨긴다', async () => {
    const landlord = await createUser();
    const ownership = await createOwnership(landlord);
    const visible = await insertDocument(landlord, ownership);
    const evidence = await insertDocument(landlord, ownership);
    await prisma.ownership.update({ where: { id: ownership.id }, data: { evidenceDocumentId: evidence.id } });
    const list = await listOwnershipDocuments(landlord, ownership);
    assert.deepEqual(list.body.data.map((item) => item.id), [visible.id]);
    assert.equal((await getJson(landlord, `/documents/${evidence.id}`)).status, 404);
  });
});
