// 서류함 조회(GET /properties/:propertyId/documents)와 GET /properties의 documentCount.
// RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js). 소유 관계·계약·문서·초대는 Prisma로 직접 만든다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const DAY_MS = 86400000;
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);
const dbDate = (offsetDays) => new Date(`${daysFromNow(offsetDays).toISOString().slice(0, 10)}T00:00:00Z`);
const ids = (documents) => documents.map((document) => document.id);

describe('서류함 조회', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const contractIds = [];
  let server;
  let origin;

  before(async () => {
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // 공유 문서 행이 문서를 참조하고, 인증 증빙 연결이 문서를 참조하므로 먼저 푼다.
    await prisma.tenantInvitation.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.ownership.updateMany({ where: { userId: { in: userIds } }, data: { evidenceDocumentId: null } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await fixture.cleanup();
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
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '107', unitNo: `${6000 + unitSeq}` } });
  };
  // verification: 'VERIFIED' | 'EXPIRED'(만료된 인증) | 'UNVERIFIED'
  const createOwnership = (property, owner, { verification = 'VERIFIED', ended = false } = {}) => {
    const verified = verification === 'VERIFIED' || verification === 'EXPIRED';
    return prisma.ownership.create({
      data: {
        propertyId: property.id,
        userId: owner.id,
        startedAt: daysFromNow(-100),
        verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED',
        ...(verified ? { verifiedAt: daysFromNow(-90), verificationExpiresAt: daysFromNow(verification === 'EXPIRED' ? -1 : 365) } : {}),
        ...(ended ? { endedAt: daysFromNow(-5), endReason: 'SOLD' } : {}),
      },
    });
  };
  // period: 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
  const createContract = async (ownership, { period = 'ACTIVE', tenantName = '임차인' } = {}) => {
    const [startDate, endDate] = period === 'EXPIRED' ? [dbDate(-400), dbDate(-10)] : [dbDate(-5), dbDate(400)];
    const contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantName,
        tenantPhone: '01012345678',
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        startDate,
        endDate,
        ...(period === 'TERMINATED' ? { terminatedOn: dbDate(-1) } : {}),
      },
    });
    contractIds.push(contract.id);
    return contract;
  };
  const insertDocument = async (user, resourceType, resourceId, { type = 'OTHER', createdAt = new Date(), deletedAt = null } = {}) => {
    const upload = await prisma.upload.create({
      data: {
        userId: user.id,
        fileName: `${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 10n,
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
        resourceType,
        resourceId,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        attachedAt: new Date(),
        createdAt,
        deletedAt,
      },
    });
  };
  const share = (contract, creator, documentIds, status = 'ACCEPTED') =>
    prisma.tenantInvitation.create({
      data: {
        contractId: contract.id,
        tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        status,
        expiresAt: daysFromNow(1),
        createdById: creator.id,
        ...(status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
        documents: { create: documentIds.map((documentId) => ({ documentId })) },
      },
    });

  const api = (user, pathname) =>
    fetch(`${origin}/api/v1${pathname}`, {
      headers: { ...(user ? { Cookie: `access_token=${signAccessToken(user)}` } : {}), 'X-Requested-With': 'butler-web' },
    });
  const getJson = async (user, pathname) => {
    const response = await api(user, pathname);
    return { status: response.status, body: await response.json() };
  };
  const box = async (user, property) => {
    const result = await getJson(user, `/properties/${property.id}/documents`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.data;
  };
  const listedCount = async (user, relation, property) => {
    const result = await getJson(user, `/properties?relation=${relation}&size=100`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.data.find((item) => item.id === property.id)?.documentCount;
  };
  const allDocumentIds = (data) => [...data.ownerships.flatMap((item) => ids(item.documents)), ...data.contracts.flatMap((item) => ids(item.documents))];

  test('B-1 같은 호실에 인증·미인증 중복 소유 관계가 있어도 서로의 서류·수가 섞이지 않는다', async () => {
    const x = await createUser();
    const y = await createUser();
    const property = await createProperty();
    const ownershipX = await createOwnership(property, x);
    const ownershipY = await createOwnership(property, y, { verification: 'UNVERIFIED' });
    const contractY = await createContract(ownershipY);
    const docX = await insertDocument(x, 'OWNERSHIP', ownershipX.id);
    const docY1 = await insertDocument(y, 'OWNERSHIP', ownershipY.id);
    const docY2 = await insertDocument(y, 'CONTRACT', contractY.id);

    const boxX = await box(x, property);
    assert.deepEqual(allDocumentIds(boxX), [docX.id]);
    assert.equal(boxX.documentCount, 1);
    assert.deepEqual(boxX.contracts, []);
    const boxY = await box(y, property);
    assert.deepEqual(allDocumentIds(boxY).sort(), [docY1.id, docY2.id].sort());
    assert.equal(boxY.documentCount, 2);
    assert.equal(await listedCount(x, 'OWNER', property), 1);
    assert.equal(await listedCount(y, 'OWNER', property), 2);
  });

  test('B-2 documentCount는 서류함 수와 같고, 종료 뒤 다시 등록한 호실의 예전 서류도 센다(OWNER·FORMER_OWNER)', async () => {
    const landlord = await createUser();
    const property = await createProperty();
    const old = await createOwnership(property, landlord, { ended: true });
    const oldContract = await createContract(old, { period: 'EXPIRED' });
    await insertDocument(landlord, 'OWNERSHIP', old.id);
    await insertDocument(landlord, 'OWNERSHIP', old.id);
    await insertDocument(landlord, 'CONTRACT', oldContract.id);
    const fresh = await createOwnership(property, landlord);
    await insertDocument(landlord, 'OWNERSHIP', fresh.id);

    const data = await box(landlord, property);
    assert.equal(data.documentCount, 4);
    assert.equal(await listedCount(landlord, 'OWNER', property), 4);

    // 지금은 소유하지 않는 호실(FORMER_OWNER)도 같다.
    const former = await createProperty();
    const formerOwnership = await createOwnership(former, landlord, { ended: true });
    const formerContract = await createContract(formerOwnership, { period: 'EXPIRED' });
    await insertDocument(landlord, 'OWNERSHIP', formerOwnership.id);
    await insertDocument(landlord, 'CONTRACT', formerContract.id);
    assert.equal((await box(landlord, former)).documentCount, 2);
    assert.equal(await listedCount(landlord, 'FORMER_OWNER', former), 2);
  });

  test('B-3·B-4 이전 소유자는 자기 서류만 읽기 전용으로 보고, 새 소유자는 예전 서류를 보지 않는다', async () => {
    const previous = await createUser();
    const next = await createUser();
    const property = await createProperty();
    const previousOwnership = await createOwnership(property, previous, { ended: true });
    const previousContract = await createContract(previousOwnership);
    const previousDocs = [await insertDocument(previous, 'OWNERSHIP', previousOwnership.id), await insertDocument(previous, 'CONTRACT', previousContract.id)];
    const nextOwnership = await createOwnership(property, next);
    const nextDoc = await insertDocument(next, 'OWNERSHIP', nextOwnership.id);

    const previousBox = await box(previous, property);
    assert.deepEqual(allDocumentIds(previousBox).sort(), ids(previousDocs).sort());
    assert.equal(previousBox.ownerships[0].isActive, false);
    assert.equal(previousBox.ownerships[0].isUploadable, false);
    assert.equal(previousBox.contracts[0].isUploadable, false);

    const nextBox = await box(next, property);
    assert.deepEqual(allDocumentIds(nextBox), [nextDoc.id]);
    assert.deepEqual(nextBox.contracts, []);
    assert.equal(nextBox.ownerships[0].isUploadable, true);
  });

  test('B-5 숨긴 문서와 권리자 인증 증빙(OWNERSHIP_VERIFICATION) 문서는 나오지 않는다', async () => {
    const landlord = await createUser();
    const property = await createProperty();
    const ownership = await createOwnership(property, landlord);
    const contract = await createContract(ownership);
    const visible = await insertDocument(landlord, 'OWNERSHIP', ownership.id);
    const visibleContract = await insertDocument(landlord, 'CONTRACT', contract.id);
    await insertDocument(landlord, 'OWNERSHIP', ownership.id, { deletedAt: new Date() });
    await insertDocument(landlord, 'CONTRACT', contract.id, { deletedAt: new Date() });
    await insertDocument(landlord, 'OWNERSHIP_VERIFICATION', ownership.id, { type: 'REGISTRY_CERTIFICATE' });

    const data = await box(landlord, property);
    assert.deepEqual(allDocumentIds(data).sort(), [visible.id, visibleContract.id].sort());
    assert.equal(data.documentCount, 2);
    assert.equal(await listedCount(landlord, 'OWNER', property), 2);
  });

  test('B-6 증빙으로 연결된 문서는 OWNERSHIP에 붙어 있어도 서류함·수·GET /documents·단건에서 빠진다', async () => {
    const landlord = await createUser();
    const property = await createProperty();
    const ownership = await createOwnership(property, landlord);
    const visible = await insertDocument(landlord, 'OWNERSHIP', ownership.id);
    const evidence = await insertDocument(landlord, 'OWNERSHIP', ownership.id, { type: 'REGISTRY_CERTIFICATE' });
    await prisma.ownership.update({ where: { id: ownership.id }, data: { evidenceDocumentId: evidence.id } });

    const data = await box(landlord, property);
    assert.deepEqual(allDocumentIds(data), [visible.id]);
    assert.equal(await listedCount(landlord, 'OWNER', property), 1);
    const list = await getJson(landlord, `/documents?resourceType=OWNERSHIP&resourceId=${ownership.id}`);
    assert.deepEqual(ids(list.body.data), [visible.id]);
    assert.equal((await getJson(landlord, `/documents/${evidence.id}`)).status, 404);
  });

  test('B-7 정렬과 status·isUploadable·verificationStatus·isSharedWithTenant', async () => {
    const landlord = await createUser();
    const property = await createProperty();
    const old = await createOwnership(property, landlord, { ended: true });
    const current = await createOwnership(property, landlord, { verification: 'EXPIRED' });
    const expired = await createContract(current, { period: 'EXPIRED', tenantName: '지난' });
    const terminated = await createContract(current, { period: 'TERMINATED', tenantName: '해지' });
    const active = await createContract(current, { tenantName: '진행' });
    const first = await insertDocument(landlord, 'CONTRACT', active.id, { createdAt: daysFromNow(-3) });
    const second = await insertDocument(landlord, 'CONTRACT', active.id, { createdAt: daysFromNow(-1) });
    await share(active, landlord, [first.id]);
    const unsharedPending = await insertDocument(landlord, 'CONTRACT', expired.id);
    await share(expired, landlord, [unsharedPending.id], 'PENDING');

    const data = await box(landlord, property);
    assert.deepEqual(data.ownerships.map((item) => item.id), [current.id, old.id]);
    assert.equal(data.ownerships[0].verificationStatus, 'EXPIRED');
    assert.equal(data.ownerships[0].isUploadable, false);
    assert.equal(data.ownerships[0].isActive, true);
    assert.equal(data.ownerships[1].isActive, false);
    assert.equal(data.property.id, property.id);
    assert.ok(data.property.displayName);

    // 진행 중 먼저, 그다음 종료일(해지일) 최근 순: 해지(어제) → 만료(10일 전)
    assert.deepEqual(data.contracts.map((item) => item.id), [active.id, terminated.id, expired.id]);
    assert.deepEqual(data.contracts.map((item) => item.status), ['ACTIVE', 'TERMINATED', 'EXPIRED']);
    assert.ok(data.contracts.every((item) => item.isUploadable === true));
    // 최근 올린 순
    assert.deepEqual(ids(data.contracts[0].documents), [second.id, first.id]);
    assert.deepEqual(data.contracts[0].documents.map((item) => item.isSharedWithTenant), [false, true]);
    assert.equal(data.contracts[2].documents[0].isSharedWithTenant, false);
  });

  test('B-8 권한: 임차인·ADMIN 403, 관계 없는 호실·UUID 아님 404, 로그인 없음 401', async () => {
    const landlord = await createUser();
    const property = await createProperty();
    await createOwnership(property, landlord);
    for (const role of ['TENANT', 'ADMIN']) {
      const user = await createUser(role);
      const result = await getJson(user, `/properties/${property.id}/documents`);
      assert.equal(result.status, 403, role);
      assert.equal(result.body.error.code, 'FORBIDDEN_ROLE');
    }
    const stranger = await createUser();
    const hidden = await getJson(stranger, `/properties/${property.id}/documents`);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.error.code, 'PROPERTY_NOT_FOUND');
    assert.equal((await getJson(landlord, `/properties/${randomUUID()}/documents`)).status, 404);
    assert.equal((await getJson(landlord, '/properties/not-a-uuid/documents')).status, 404);
    assert.equal((await getJson(null, `/properties/${property.id}/documents`)).status, 401);
  });

  test('B-9 응답에 url·tenantPhone·deposit·monthlyRent가 없다', async () => {
    const landlord = await createUser();
    const property = await createProperty();
    const ownership = await createOwnership(property, landlord);
    const contract = await createContract(ownership);
    await insertDocument(landlord, 'OWNERSHIP', ownership.id);
    await insertDocument(landlord, 'CONTRACT', contract.id);
    const text = JSON.stringify(await box(landlord, property));
    for (const key of ['"url"', 'tenantPhone', 'deposit', 'monthlyRent', 'storagePath']) assert.ok(!text.includes(key), key);
  });

  test('B-10 동치: 서류함 문서 집합 = 소유 관계·계약별 GET /documents 결과의 합집합', async () => {
    const landlord = await createUser();
    const other = await createUser();
    const property = await createProperty();
    const old = await createOwnership(property, landlord, { ended: true });
    const current = await createOwnership(property, landlord);
    const othersOwnership = await createOwnership(property, other, { verification: 'UNVERIFIED' });
    const contractA = await createContract(old, { period: 'EXPIRED' });
    const contractB = await createContract(current);
    const contractC = await createContract(current, { period: 'TERMINATED' });
    const othersContract = await createContract(othersOwnership);

    await insertDocument(landlord, 'OWNERSHIP', old.id);
    await insertDocument(landlord, 'OWNERSHIP', current.id);
    await insertDocument(landlord, 'CONTRACT', contractA.id);
    await insertDocument(landlord, 'CONTRACT', contractB.id);
    await insertDocument(landlord, 'CONTRACT', contractC.id);
    await insertDocument(landlord, 'OWNERSHIP', current.id, { deletedAt: new Date() });
    await insertDocument(landlord, 'OWNERSHIP_VERIFICATION', current.id, { type: 'REGISTRY_CERTIFICATE' });
    const evidence = await insertDocument(landlord, 'OWNERSHIP', current.id, { type: 'REGISTRY_CERTIFICATE' });
    await prisma.ownership.update({ where: { id: current.id }, data: { evidenceDocumentId: evidence.id } });
    await insertDocument(other, 'OWNERSHIP', othersOwnership.id);
    await insertDocument(other, 'CONTRACT', othersContract.id);

    const data = await box(landlord, property);
    const union = [];
    for (const [resourceType, resourceId] of [
      ...[old, current].map((ownership) => ['OWNERSHIP', ownership.id]),
      ...[contractA, contractB, contractC].map((contract) => ['CONTRACT', contract.id]),
    ]) {
      const list = await getJson(landlord, `/documents?resourceType=${resourceType}&resourceId=${resourceId}`);
      assert.equal(list.status, 200);
      union.push(...ids(list.body.data));
    }
    assert.deepEqual(allDocumentIds(data).sort(), union.sort());
    assert.equal(data.documentCount, union.length);
    assert.equal(await listedCount(landlord, 'OWNER', property), union.length);
  });
});
