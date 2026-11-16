// CONTRACT 문서 권한(docs/11 개발 계획 2-4, 결정 4). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다. 초대·공유 문서 행은 Prisma로 직접 만든다(초대 API는 따로 테스트한다).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { createDocumentDownloadUrl, findSharedInvitationDocument } from '../../../src/domains/documents/service.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const SECRET = 'test-secret';
const PDF = Buffer.from('%PDF-1.7\n테스트 계약서');
const DAY_MS = 86400000;
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL'];
const clearStorageContentLimits = () => prisma.rateLimit.deleteMany({ where: { id: { startsWith: 'storage-content:' } } });
const dbDate = (offsetDays) => new Date(`${new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)}T00:00:00Z`);

describe('CONTRACT 문서 권한', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const contractIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-contract-documents-'));
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
    // 공유 문서 행이 문서를 참조하므로 초대(공유 행 cascade)를 먼저 지운다.
    await prisma.tenantInvitation.deleteMany({ where: { contractId: { in: contractIds } } });
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
  // 호실·소유 관계·계약을 만든다. period: 'ACTIVE' | 'EXPIRED'
  const createContract = async (owner, { period = 'ACTIVE', ownershipEnded = false, tenantId = null } = {}) => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '103', unitNo: `${4000 + unitSeq}` } });
    const ownership = await prisma.ownership.create({
      data: { propertyId: property.id, userId: owner.id, ...(ownershipEnded ? { endedAt: new Date(), endReason: 'SOLD' } : {}) },
    });
    const [startDate, endDate] = period === 'EXPIRED' ? [dbDate(-400), dbDate(-10)] : [dbDate(-30), dbDate(400)];
    const contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantId,
        tenantName: '임차인',
        tenantPhone: '01012345678',
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        startDate,
        endDate,
      },
    });
    contractIds.push(contract.id);
    return { contract, ownership };
  };
  const shareInvitation = (contract, creator, documentIds, { status = 'ACCEPTED', acceptedBy = null } = {}) =>
    prisma.tenantInvitation.create({
      data: {
        contractId: contract.id,
        tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        status,
        expiresAt: new Date(Date.now() + DAY_MS),
        createdById: creator.id,
        ...(status === 'ACCEPTED' ? { acceptedAt: new Date(), acceptedById: acceptedBy } : {}),
        documents: { create: documentIds.map((documentId) => ({ documentId })) },
      },
    });
  // 업로드 없이 붙은 문서 행을 바로 만든다(상한 테스트용).
  const insertAttachedDocument = async (user, contract) => {
    const upload = await prisma.upload.create({
      data: {
        userId: user.id,
        fileName: '계약서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(PDF.length),
        type: 'CONTRACT_DOCUMENT',
        storagePath: `uploads/${randomUUID()}`,
        expiresAt: new Date(Date.now() + DAY_MS),
        completedAt: new Date(),
      },
    });
    return prisma.document.create({
      data: {
        uploadId: upload.id,
        uploaderId: user.id,
        type: upload.type,
        resourceType: 'CONTRACT',
        resourceId: contract.id,
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
  const listContractDocuments = (user, contract) => getJson(user, `/documents?resourceType=CONTRACT&resourceId=${contract.id}`);

  // 올리고 계약에 붙인다. 등록 응답(status·body)을 그대로 돌려준다.
  const uploadToContract = async (user, contract) => {
    const session = await postJson(user, '/files/upload-sessions', {
      fileName: '계약서.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      documentType: 'CONTRACT_DOCUMENT',
    });
    assert.equal(session.status, 201);
    const put = await fetch(`${origin}${session.body.data.uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: PDF });
    assert.equal(put.status, 204);
    return postJson(user, '/documents', { uploadSessionId: session.body.data.id, resourceType: 'CONTRACT', resourceId: contract.id });
  };

  test('활성 소유자: 올리기 → 목록·상세 → 다운로드(감사) → 삭제', async () => {
    const landlord = await createUser();
    const { contract } = await createContract(landlord);

    const registered = await uploadToContract(landlord, contract);
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const document = registered.body.data;
    assert.equal(document.resourceType, 'CONTRACT');
    assert.equal(document.resourceId, contract.id);

    const list = await listContractDocuments(landlord, contract);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((item) => item.id), [document.id]);
    assert.equal((await getJson(landlord, `/documents/${document.id}`)).status, 200);

    const download = await postJson(landlord, `/documents/${document.id}/download-url`, {});
    assert.equal(download.status, 200);
    const audited = await prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_DOWNLOAD_URL_ISSUED', resourceId: document.id } });
    assert.equal(audited.actorId, landlord.id);

    assert.equal((await json(await api(landlord, `/documents/${document.id}`, { method: 'DELETE' }))).status, 204);
    assert.equal((await listContractDocuments(landlord, contract)).body.data.length, 0);
  });

  test('이전 소유자는 보기만 한다(올리기 422 CONTRACT_READ_ONLY)', async () => {
    const landlord = await createUser();
    const { contract } = await createContract(landlord);
    const document = await insertAttachedDocument(landlord, contract);
    await prisma.ownership.update({ where: { id: contract.ownershipId }, data: { endedAt: new Date(), endReason: 'SOLD' } });

    const list = await listContractDocuments(landlord, contract);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((item) => item.id), [document.id]);
    assert.equal((await getJson(landlord, `/documents/${document.id}`)).status, 200);
    assert.equal((await postJson(landlord, `/documents/${document.id}/download-url`, {})).status, 200);

    const rejected = await uploadToContract(landlord, contract);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'CONTRACT_READ_ONLY');
    const deleted = await json(await api(landlord, `/documents/${document.id}`, { method: 'DELETE' }));
    assert.equal(deleted.status, 422);
    assert.equal(deleted.body.error.code, 'CONTRACT_READ_ONLY');
  });

  test('만료된 계약에는 올릴 수 없다(422 CONTRACT_READ_ONLY)', async () => {
    const landlord = await createUser();
    const { contract } = await createContract(landlord, { period: 'EXPIRED' });
    const rejected = await uploadToContract(landlord, contract);
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'CONTRACT_READ_ONLY');
    assert.equal((await listContractDocuments(landlord, contract)).status, 200);
  });

  test('연결된 임차인은 수락한 초대로 공유받은 문서만 보고, 올릴 수 없다(403)', async () => {
    const landlord = await createUser();
    const tenant = await createUser('TENANT');
    const { contract } = await createContract(landlord, { tenantId: tenant.id });
    const shared = await insertAttachedDocument(landlord, contract);
    const unshared = await insertAttachedDocument(landlord, contract);
    const pendingOnly = await insertAttachedDocument(landlord, contract);
    await shareInvitation(contract, landlord, [shared.id], { acceptedBy: tenant.id });
    // 수락하지 않은 초대에 공유한 문서는 보이지 않는다.
    await shareInvitation(contract, landlord, [pendingOnly.id], { status: 'PENDING' });

    const list = await listContractDocuments(tenant, contract);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((item) => item.id), [shared.id]);
    assert.equal(list.body.meta.total, 1);
    assert.equal((await getJson(tenant, `/documents/${shared.id}`)).status, 200);
    assert.equal((await postJson(tenant, `/documents/${shared.id}/download-url`, {})).status, 200);

    for (const hidden of [unshared, pendingOnly]) {
      const detail = await getJson(tenant, `/documents/${hidden.id}`);
      assert.equal(detail.status, 404);
      assert.equal(detail.body.error.code, 'DOCUMENT_NOT_FOUND');
      assert.equal((await postJson(tenant, `/documents/${hidden.id}/download-url`, {})).status, 404);
    }

    const upload = await uploadToContract(tenant, contract);
    assert.equal(upload.status, 403);
    assert.equal(upload.body.error.code, 'FORBIDDEN_ROLE');
    // 남이 올린 문서라 지울 수 없다.
    assert.equal((await json(await api(tenant, `/documents/${shared.id}`, { method: 'DELETE' }))).status, 422);

    // 임대인은 전부 본다.
    assert.equal((await listContractDocuments(landlord, contract)).body.data.length, 3);
  });

  test('ADMIN·다른 임대인·연결 안 된 임차인은 404', async () => {
    const landlord = await createUser();
    const { contract } = await createContract(landlord);
    const document = await insertAttachedDocument(landlord, contract);
    const admin = await createUser('ADMIN');
    const otherLandlord = await createUser();
    const stranger = await createUser('TENANT');

    for (const user of [admin, otherLandlord, stranger]) {
      const list = await listContractDocuments(user, contract);
      assert.equal(list.status, 404);
      assert.equal(list.body.error.code, 'CONTRACT_NOT_FOUND');
      assert.equal((await getJson(user, `/documents/${document.id}`)).status, 404);
      assert.equal((await postJson(user, `/documents/${document.id}/download-url`, {})).status, 404);
    }
    const upload = await uploadToContract(otherLandlord, contract);
    assert.equal(upload.status, 404);
    assert.equal(upload.body.error.code, 'CONTRACT_NOT_FOUND');
    const missing = await uploadToContract(landlord, { id: randomUUID() });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'CONTRACT_NOT_FOUND');
  });

  test('계약당 30개까지 붙일 수 있다', async () => {
    const landlord = await createUser();
    const { contract } = await createContract(landlord);
    for (let index = 0; index < 29; index += 1) await insertAttachedDocument(landlord, contract);
    assert.equal((await uploadToContract(landlord, contract)).status, 201);
    const over = await uploadToContract(landlord, contract);
    assert.equal(over.status, 422);
    assert.equal(over.body.error.code, 'ATTACHMENT_LIMIT_EXCEEDED');
  });

  test('findSharedInvitationDocument·createDocumentDownloadUrl(actor: null)', async () => {
    const landlord = await createUser();
    const { contract } = await createContract(landlord);
    const { contract: otherContract } = await createContract(landlord);
    const shared = await insertAttachedDocument(landlord, contract);
    const unshared = await insertAttachedDocument(landlord, contract);
    const deleted = await insertAttachedDocument(landlord, contract);
    const invitation = await shareInvitation(contract, landlord, [shared.id, deleted.id], { status: 'PENDING' });
    await prisma.document.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const found = await findSharedInvitationDocument({ invitationId: invitation.id, contractId: contract.id, documentId: shared.id });
    assert.equal(found.id, shared.id);
    assert.equal(await findSharedInvitationDocument({ invitationId: invitation.id, contractId: contract.id, documentId: unshared.id }), null);
    assert.equal(await findSharedInvitationDocument({ invitationId: invitation.id, contractId: contract.id, documentId: deleted.id }), null);
    assert.equal(await findSharedInvitationDocument({ invitationId: invitation.id, contractId: otherContract.id, documentId: shared.id }), null);

    const { url, expiresAt } = await createDocumentDownloadUrl(found, { actor: null });
    assert.ok(url.startsWith(`/api/v1/documents/${shared.id}/content?token=`));
    const ttlMinutes = (Date.parse(expiresAt) - Date.now()) / 60000;
    assert.ok(ttlMinutes > 4 && ttlMinutes <= 5);
    const audited = await prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_DOWNLOAD_URL_ISSUED', resourceId: shared.id } });
    assert.equal(audited.actorType, 'SYSTEM');
    assert.equal(audited.actorId, null);
  });
});
