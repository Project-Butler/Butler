// 매도 뒤 판 사람(H-41, docs 15 2단계 계획 P-4a2): 넘어간 기록 숨김, 매도 뒤 새 기록, [목록에서 지우기].
// 실제 로컬 Postgres + 임시 폴더의 실제 파일. RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { createManagementLog, deleteManagementLog, findPropertyManagementLogs } from '../../../src/domains/managementLogs/service.js';
import { searchAll } from '../../../src/domains/search/service.js';
import { addDaysToDateString, getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const SECRET = 'test-secret';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF seller')]);
const FUTURE_EXPIRY = new Date(Date.now() + 86400000 * 365);
const STORAGE_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL'];
const LIST_DEFAULTS = { propertyId: null, scope: null, types: [], until: null, sortDirection: 'desc', page: 1, size: 20 };
const TODAY = getTodayKST();
const day = (value) => new Date(`${value}T00:00:00Z`);

describe('매도 뒤 판 사람(H-41)', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of STORAGE_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-seller-'));
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
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '105', unitNo: `${6000 + unitSeq}` } });
  };
  const verified = { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE_EXPIRY, firstVerifiedAt: new Date() };
  const own = (user, property, data = verified) => prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...data } });

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
  const get = async (user, pathname) => json(await api(user, pathname));
  const send = async (user, method, pathname, body) => json(await api(user, pathname, { method, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const uploadDocument = async (user, resource = {}, { fileName = '사진.jpg', documentType = 'PHOTO' } = {}) => {
    const session = await send(user, 'POST', '/files/upload-sessions', { fileName, mimeType: 'image/jpeg', sizeBytes: JPEG.length, documentType });
    const put = await fetch(`${origin}${session.body.data.uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: JPEG });
    assert.equal(put.status, 204);
    const registered = await send(user, 'POST', '/documents', { uploadSessionId: session.body.data.id, ...resource });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    return registered.body.data;
  };
  const storedFiles = async () => (await readdir(storageDir, { recursive: true })).map((file) => path.basename(file));
  const uploadIdOf = async (documentId) => (await prisma.document.findUnique({ where: { id: documentId } })).uploadId;
  const sell = async (seller, ownership) => {
    const ended = await send(seller, 'POST', `/property-ownerships/${ownership.id}/end`, { endReason: 'SOLD' });
    assert.equal(ended.status, 200, JSON.stringify(ended.body));
  };
  const listIds = async (user, property) => (await findPropertyManagementLogs(user, property.id, LIST_DEFAULTS)).items.map((log) => log.id);
  const searchLogs = async (user, query) => (await searchAll(user, { query, types: ['MANAGEMENT_LOG'] })).managementLogs.map((log) => log.id);

  test('넘어간 호실 이력: 수정 422, 삭제는 판 사람에게만 숨김(목록·상세·검색·문서 404), 산 사람은 그대로', async () => {
    const seller = await landlord();
    const buyer = await landlord();
    const property = await createProperty();
    const sellerOwnership = await own(seller, property);
    const historyDoc = await uploadDocument(seller);
    const history = await createManagementLog(seller, property.id, {
      type: 'REPAIR',
      title: '숨김대상 보일러 교체',
      occurredOn: TODAY,
      attachmentDocumentIds: [historyDoc.id],
    });
    assert.equal(history.scope, 'PROPERTY_HISTORY');
    await sell(seller, sellerOwnership);
    await own(buyer, property);

    const sellerView = await get(seller, `/management-logs/${history.id}`);
    assert.deepEqual(
      [sellerView.body.data.isReadOnly, sellerView.body.data.isDeletable, sellerView.body.data.isHideOnly],
      [true, true, true],
    );
    const edit = await send(seller, 'PATCH', `/management-logs/${history.id}`, { title: '위조' });
    assert.equal(edit.status, 422);
    assert.equal(edit.body.error.code, 'MANAGEMENT_LOG_READ_ONLY');

    assert.equal((await send(seller, 'DELETE', `/management-logs/${history.id}`)).status, 204);
    // 이미 숨겼어도 204
    assert.equal((await send(seller, 'DELETE', `/management-logs/${history.id}`)).status, 204);
    assert.equal(await prisma.propertyLogHide.count({ where: { userId: seller.id, logId: history.id, ownershipId: sellerOwnership.id } }), 1);

    // 판 사람: 목록·상세·검색·문서에서 사라진다. 기록과 문서는 그대로다.
    assert.deepEqual(await listIds(seller, property), []);
    assert.equal((await get(seller, '/management-logs')).body.data.length, 0);
    assert.equal((await get(seller, `/management-logs/${history.id}`)).status, 404);
    assert.deepEqual(await searchLogs(seller, '숨김대상'), []);
    assert.equal((await get(seller, `/documents/${historyDoc.id}`)).status, 404);
    assert.equal((await send(seller, 'POST', `/documents/${historyDoc.id}/download-url`, {})).status, 404);
    assert.equal(await prisma.propertyLog.count({ where: { id: history.id } }), 1);
    assert.equal((await prisma.document.findUnique({ where: { id: historyDoc.id } })).deletedAt, null);

    // 산 사람(인증 활성): 그대로 보이고 다운로드도 된다. 숨김·삭제는 못 한다.
    assert.deepEqual(await listIds(buyer, property), [history.id]);
    const buyerView = await get(buyer, `/management-logs/${history.id}`);
    assert.deepEqual([buyerView.body.data.isFromPreviousOwner, buyerView.body.data.isDeletable, buyerView.body.data.isHideOnly], [true, false, false]);
    assert.deepEqual(await searchLogs(buyer, '숨김대상'), [history.id]);
    assert.equal((await send(buyer, 'POST', `/documents/${historyDoc.id}/download-url`, {})).status, 200);
    assert.equal((await send(buyer, 'DELETE', `/management-logs/${history.id}`)).status, 404);
  });

  test('매도 뒤 새 기록: 201(PRIVATE·나만 보기) → 수정 200 → 첨부 201 → 삭제 204, 산 사람에게는 안 보인다', async () => {
    const seller = await landlord();
    const buyer = await landlord();
    const property = await createProperty();
    const sellerOwnership = await own(seller, property);
    await sell(seller, sellerOwnership);
    await own(buyer, property);

    const rejected = await send(seller, 'POST', `/properties/${property.id}/management-logs`, {
      type: 'NOTE',
      title: '공개 요청',
      occurredOn: TODAY,
      scope: 'PROPERTY_HISTORY',
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'SCOPE_NOT_ALLOWED');

    const created = await send(seller, 'POST', `/properties/${property.id}/management-logs`, { type: 'REPAIR', title: '매도 뒤 정산 메모', occurredOn: TODAY });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const log = created.body.data;
    assert.equal(log.scope, 'PRIVATE');
    assert.deepEqual([log.isReadOnly, log.isDeletable, log.isHideOnly, log.isFromPreviousOwner], [false, true, false, false]);
    const row = await prisma.propertyLog.findUnique({ where: { id: log.id } });
    assert.equal(row.ownershipId, sellerOwnership.id);
    assert.equal(row.keepPrivate, true);

    const edited = await send(seller, 'PATCH', `/management-logs/${log.id}`, { title: '매도 뒤 정산 메모(수정)' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.title, '매도 뒤 정산 메모(수정)');

    const doc = await uploadDocument(seller, { resourceType: 'MANAGEMENT_LOG', resourceId: log.id });
    const uploadId = await uploadIdOf(doc.id);
    assert.ok((await storedFiles()).includes(uploadId));
    assert.equal((await get(buyer, `/management-logs/${log.id}`)).status, 404);

    assert.equal((await send(seller, 'DELETE', `/management-logs/${log.id}`)).status, 204);
    assert.equal(await prisma.propertyLog.count({ where: { id: log.id } }), 0);
    assert.ok((await prisma.document.findUnique({ where: { id: doc.id } })).deletedAt);
    assert.equal((await storedFiles()).includes(uploadId), false);
  });

  test('매도 뒤 쓰기는 인증한 적 있는 SOLD 관계만: SUPERSEDED·인증 전·지운 관계는 404', async () => {
    const user = await landlord();
    const input = { type: 'NOTE', title: '메모', occurredOn: TODAY };
    const ended = { endedAt: new Date(), ...verified };

    const superseded = await createProperty();
    await own(user, superseded, { ...ended, endReason: 'SUPERSEDED' });
    const neverVerified = await createProperty();
    await own(user, neverVerified, { endedAt: new Date(), endReason: 'SOLD' });
    const removed = await createProperty();
    await own(user, removed, { ...ended, endReason: 'SOLD', removedAt: new Date() });
    for (const property of [superseded, neverVerified, removed]) {
      const response = await send(user, 'POST', `/properties/${property.id}/management-logs`, input);
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, 'PROPERTY_NOT_FOUND');
    }
  });

  test('같은 호실을 다시 사서 인증하면 예전 숨김은 무시되어 호실 이력이 다시 보인다', async () => {
    const seller = await landlord();
    const property = await createProperty();
    const first = await own(seller, property);
    const history = await createManagementLog(seller, property.id, { type: 'INSPECTION', title: '점검', occurredOn: TODAY });
    await sell(seller, first);
    await deleteManagementLog(seller, history.id);
    assert.deepEqual(await listIds(seller, property), []);

    const again = await own(seller, property, { verificationStatus: 'UNVERIFIED' });
    assert.deepEqual(await listIds(seller, property), []);
    await prisma.ownership.update({ where: { id: again.id }, data: verified });
    assert.deepEqual(await listIds(seller, property), [history.id]);
  });

  test('목록에서 지우기: 판 사람 나만 보기 기록·문서·숨김만 지우고, 6곳 목록에서 빠지며, 계약·서류·산 사람 이력은 남는다', async () => {
    const seller = await landlord();
    const buyer = await landlord();
    const tenant = await landlord();
    const property = await createProperty();
    const sellerOwnership = await own(seller, property);
    const contract = await prisma.contract.create({
      data: {
        ownershipId: sellerOwnership.id,
        tenantId: tenant.id,
        tenantName: '박지움임차',
        tenantPhone: '01012345678',
        leaseType: 'JEONSE',
        deposit: 50000000n,
        monthlyRent: 0n,
        startDate: day(addDaysToDateString(TODAY, -100)),
        endDate: day(addDaysToDateString(TODAY, 200)),
      },
    });
    const contractDoc = await uploadDocument(seller, { resourceType: 'CONTRACT', resourceId: contract.id }, { fileName: '지움계약서.jpg', documentType: 'OTHER' });
    const ownershipDoc = await uploadDocument(seller, { resourceType: 'OWNERSHIP', resourceId: sellerOwnership.id }, { fileName: '지움소유서류.jpg', documentType: 'OTHER' });
    const history = await createManagementLog(seller, property.id, { type: 'REPAIR', title: '지움이력 배관', occurredOn: TODAY });
    const memo = await createManagementLog(seller, property.id, { type: 'NOTE', title: '지움메모 매도 전', occurredOn: TODAY, keepPrivate: true });
    await sell(seller, sellerOwnership);
    const buyerOwnership = await own(buyer, property);
    const afterSale = (await send(seller, 'POST', `/properties/${property.id}/management-logs`, { type: 'NOTE', title: '지움메모 매도 뒤', occurredOn: TODAY })).body.data;
    const afterSaleDoc = await uploadDocument(seller, { resourceType: 'MANAGEMENT_LOG', resourceId: afterSale.id });
    const afterSaleUploadId = await uploadIdOf(afterSaleDoc.id);
    await deleteManagementLog(seller, history.id);

    // 지우기 전: 6곳에 모두 보인다.
    const ownershipIds = async () => (await get(seller, '/property-ownerships')).body.data.map((item) => item.id);
    const formerIds = async () => (await get(seller, '/properties?relation=FORMER_OWNER')).body.data.map((item) => item.id);
    const contractIds = async () => (await get(seller, '/contracts?status=EXPIRED&includeEndedOwnership=true')).body.data.map((item) => item.id);
    const searchFor = (query) => searchAll(seller, { query, types: ['CONTRACT', 'DOCUMENT', 'MANAGEMENT_LOG'] });
    assert.ok((await ownershipIds()).includes(sellerOwnership.id));
    assert.ok((await formerIds()).includes(property.id));
    assert.ok((await contractIds()).includes(contract.id));
    assert.equal((await searchFor('박지움임차')).contracts.length, 1);
    assert.equal((await searchFor('지움소유서류')).documents.length, 1);
    assert.equal((await searchFor('지움계약서')).documents.length, 1);
    assert.equal((await searchFor('지움메모')).managementLogs.length, 2);
    assert.equal((await get(seller, `/properties/${property.id}/documents`)).status, 200);

    // 활성 소유 관계는 422, 남의 소유 관계는 404.
    const active = await send(buyer, 'POST', `/property-ownerships/${buyerOwnership.id}/remove`);
    assert.equal(active.status, 422);
    assert.equal(active.body.error.code, 'OWNERSHIP_ACTIVE');
    assert.equal((await send(buyer, 'POST', `/property-ownerships/${sellerOwnership.id}/remove`)).status, 404);

    assert.equal((await send(seller, 'POST', `/property-ownerships/${sellerOwnership.id}/remove`)).status, 204);
    // 이미 지웠으면 그대로 204
    assert.equal((await send(seller, 'POST', `/property-ownerships/${sellerOwnership.id}/remove`)).status, 204);

    // 판 사람 나만 보기 기록·문서·숨김은 0, 파일도 지운다.
    assert.ok((await prisma.ownership.findUnique({ where: { id: sellerOwnership.id } })).removedAt);
    assert.equal(await prisma.propertyLog.count({ where: { ownershipId: sellerOwnership.id, scope: 'PRIVATE' } }), 0);
    assert.equal(await prisma.propertyLog.count({ where: { id: { in: [memo.id, afterSale.id] } } }), 0);
    assert.ok((await prisma.document.findUnique({ where: { id: afterSaleDoc.id } })).deletedAt);
    assert.equal((await storedFiles()).includes(afterSaleUploadId), false);
    assert.equal(await prisma.propertyLogHide.count({ where: { ownershipId: sellerOwnership.id } }), 0);
    // 계약·계약 서류·소유 서류는 지우지 않는다. 산 사람 호실 이력은 그대로다.
    assert.equal(await prisma.contract.count({ where: { id: contract.id } }), 1);
    assert.equal((await prisma.document.findUnique({ where: { id: contractDoc.id } })).deletedAt, null);
    assert.equal((await prisma.document.findUnique({ where: { id: ownershipDoc.id } })).deletedAt, null);
    assert.deepEqual(await listIds(buyer, property), [history.id]);

    // removedAt 영향 목록 6곳
    assert.equal((await ownershipIds()).includes(sellerOwnership.id), false); // 1) 소유 관계 목록
    assert.equal((await formerIds()).includes(property.id), false); // 2) 예전 소유 호실
    assert.equal((await contractIds()).includes(contract.id), false); // 3) 계약 목록(includeEndedOwnership)
    assert.equal((await searchFor('박지움임차')).contracts.length, 0); // 4) 통합 검색 계약·서류
    assert.equal((await searchFor('지움소유서류')).documents.length, 0);
    assert.equal((await searchFor('지움계약서')).documents.length, 0);
    assert.equal((await searchFor('지움이력')).managementLogs.length, 0); // 5) 하우스 로그 보기
    assert.equal((await get(seller, `/properties/${property.id}/management-logs`)).status, 404);
    assert.equal((await get(seller, '/management-logs')).body.data.length, 0);
    assert.equal((await get(seller, `/properties/${property.id}/documents`)).status, 404); // 6) 서류함(소유 서류)
    // 지운 관계에는 다시 쓸 수 없다.
    assert.equal((await send(seller, 'POST', `/properties/${property.id}/management-logs`, { type: 'NOTE', title: '다시', occurredOn: TODAY })).status, 404);
  });
});
