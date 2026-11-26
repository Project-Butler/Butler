// 관리자 문서 목록 GET /admin/documents(docs/18 계획 4·5·7장). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 서비스 함수를 직접 부른다(권한은 admin 라우터 공통 roleGuard(['ADMIN'])가 맡는다).
// 다른 데이터와 섞이지 않게 매번 uploaderId(이 테스트가 만든 사용자)로 거른다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { findAdminDocuments } from '../../../src/domains/admin/documentList.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const RESPONSE_KEYS = ['createdAt', 'documentType', 'fileName', 'id', 'link', 'mimeType', 'property', 'resourceId', 'resourceType', 'sizeBytes', 'uploader'];
const PAGE = { page: 1, size: 100 };
const query = (overrides) => ({ resourceTypes: null, uploaderId: null, from: null, until: null, ...PAGE, ...overrides });

describe('관리자 문서 목록', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  let landlord;
  let tenant;
  let otherLandlord;
  let property;
  let ownership;
  let contract;
  let ticket;
  let log;
  let notice;
  let contractMessage;
  let ticketMessage;
  let endedOwnership;
  const docs = {};

  const createUser = async (role) => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  let seq = 0;
  // 문서 한 건(업로드 행 포함). createdAt을 정할 수 있다.
  const createDocument = async (uploader, resourceType, resourceId, { createdAt, deletedAt = null, fileName } = {}) => {
    seq += 1;
    const uploadId = randomUUID();
    await prisma.upload.create({
      data: {
        id: uploadId, userId: uploader.id, fileName: fileName ?? `file-${seq}.pdf`, mimeType: 'application/pdf', sizeBytes: 1024n,
        type: 'OTHER', storagePath: `uploads/${uploadId}`, expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return prisma.document.create({
      data: {
        uploadId, uploaderId: uploader.id, type: 'OTHER', resourceType, resourceId, storagePath: `uploads/${uploadId}`,
        fileName: fileName ?? `file-${seq}.pdf`, mimeType: 'application/pdf', sizeBytes: 1024n, deletedAt,
        ...(createdAt && { createdAt }),
      },
    });
  };

  const createProperty = async (unitNo) => {
    const complex = await fixture.createComplex();
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo } });
  };

  const createThread = async (contextType, contextId) =>
    prisma.thread.create({
      data: {
        contextType, contextId,
        participants: { create: [{ userId: landlord.id }, { userId: tenant.id }] },
        messages: { create: { senderId: tenant.id, body: '사진 보내요' } },
      },
      include: { messages: true },
    });

  before(async () => {
    landlord = await createUser('LANDLORD');
    tenant = await createUser('TENANT');
    otherLandlord = await createUser('LANDLORD');
    property = await createProperty('1201');
    ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: landlord.id } });
    contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id, tenantId: tenant.id, tenantName: '임차인', tenantPhone: '01000000000', leaseType: 'MONTHLY', deposit: 10000000n, monthlyRent: 500000n,
        startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2027-12-31T00:00:00Z'),
      },
    });
    ticket = await prisma.ticket.create({
      data: { propertyId: property.id, ownershipId: ownership.id, requesterId: tenant.id, category: 'REPAIR', title: '누수', description: '물이 새요' },
    });
    log = await prisma.propertyLog.create({
      data: { propertyId: property.id, ownershipId: ownership.id, scope: 'PROPERTY_HISTORY', type: 'NOTE', title: '메모', occurredOn: new Date('2026-11-01T00:00:00Z') },
    });
    notice = await prisma.renewalNotice.create({
      data: { contractId: contract.id, authorId: landlord.id, kind: 'REFUSE_RENEWAL', method: 'CERTIFIED_MAIL', sentOn: new Date('2026-11-01T00:00:00Z') },
    });
    const contractThread = await createThread('CONTRACT', contract.id);
    const ticketThread = await createThread('TICKET', ticket.id);
    contractMessage = contractThread.messages[0];
    ticketMessage = ticketThread.messages[0];
    // 운영자가 숨긴 메시지(R5)
    await prisma.threadMessage.update({ where: { id: ticketMessage.id }, data: { isHidden: true, hiddenAt: new Date() } });

    // 판 사람이 목록에서 지운 종료된 소유 관계(R4)
    const soldProperty = await createProperty('1202');
    endedOwnership = await prisma.ownership.create({
      data: { propertyId: soldProperty.id, userId: otherLandlord.id, endedAt: new Date(), endReason: 'SOLD', removedAt: new Date() },
    });

    docs.contract = await createDocument(landlord, 'CONTRACT', contract.id);
    docs.ownership = await createDocument(landlord, 'OWNERSHIP', ownership.id);
    docs.ticket = await createDocument(tenant, 'TICKET', ticket.id);
    docs.log = await createDocument(landlord, 'MANAGEMENT_LOG', log.id);
    docs.notice = await createDocument(landlord, 'RENEWAL_NOTICE', notice.id);
    docs.contractMessage = await createDocument(tenant, 'THREAD_MESSAGE', contractMessage.id);
    docs.hiddenTicketMessage = await createDocument(tenant, 'THREAD_MESSAGE', ticketMessage.id);
    docs.endedOwnership = await createDocument(otherLandlord, 'OWNERSHIP', endedOwnership.id);
    // 나오면 안 되는 문서들
    docs.deleted = await createDocument(landlord, 'CONTRACT', contract.id, { deletedAt: new Date() });
    docs.unattached = await createDocument(landlord, null, null);
    docs.evidence = await createDocument(otherLandlord, 'OWNERSHIP', endedOwnership.id);
    await prisma.ownership.update({ where: { id: endedOwnership.id }, data: { evidenceDocumentId: docs.evidence.id } });
  });

  after(async () => {
    await prisma.ownership.updateMany({ where: { userId: { in: userIds } }, data: { evidenceDocumentId: null } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    await fixture.cleanup();
  });

  const listFor = async (users, overrides = {}) => {
    const results = [];
    for (const user of users) results.push(...(await findAdminDocuments(query({ uploaderId: user.id, ...overrides }))).items);
    return results;
  };
  const allMine = () => listFor([landlord, tenant, otherLandlord]);
  const findItem = (items, document) => items.find((item) => item.id === document.id);

  test('여섯 종류 문서가 각각 호실·이동 대상과 함께 나온다', async () => {
    const items = await allMine();
    const expectations = [
      [docs.contract, { type: 'CONTRACT', id: contract.id }],
      [docs.ownership, null],
      [docs.ticket, { type: 'TICKET', id: ticket.id }],
      [docs.log, null],
      [docs.notice, { type: 'CONTRACT', id: contract.id }],
      [docs.contractMessage, null],
    ];
    for (const [document, link] of expectations) {
      const item = findItem(items, document);
      assert.ok(item, `${document.resourceType} 문서가 나와야 한다`);
      assert.equal(item.property?.id, property.id, `${document.resourceType} 문서의 호실`);
      assert.deepEqual(item.link, link, `${document.resourceType} 문서의 이동 대상`);
    }
  });

  test('메시지 첨부는 계약 방·티켓 방 모두 그 호실을 찾는다', async () => {
    const items = await allMine();
    assert.equal(findItem(items, docs.contractMessage).property.id, property.id);
    assert.equal(findItem(items, docs.hiddenTicketMessage).property.id, property.id);
  });

  test('운영자가 숨긴 메시지의 첨부도 나온다(R5)', async () => {
    assert.ok(findItem(await allMine(), docs.hiddenTicketMessage));
  });

  test('소유를 끝내고 목록에서 지운 소유 관계의 문서도 나온다(R4)', async () => {
    const item = findItem(await allMine(), docs.endedOwnership);
    assert.ok(item);
    assert.equal(item.property.displayName.includes('1202'), true);
  });

  test('삭제한 문서·안 붙은 임시 문서·인증 증빙 문서는 나오지 않는다(Q2·R3·R1)', async () => {
    const items = await allMine();
    for (const document of [docs.deleted, docs.unattached, docs.evidence]) assert.equal(findItem(items, document), undefined);
  });

  test('응답에는 허용한 칸만 있다(저장 경로·업로드 id·다운로드 주소 없음)', async () => {
    const [item] = await listFor([landlord]);
    assert.deepEqual(Object.keys(item).sort(), RESPONSE_KEYS);
    assert.deepEqual(Object.keys(item.uploader).sort(), ['id', 'name', 'role']);
    assert.equal(typeof item.sizeBytes, 'number');
  });

  test('첨부 위치·등록자로 거른다', async () => {
    const tickets = await listFor([tenant], { resourceTypes: ['TICKET'] });
    assert.deepEqual(tickets.map((item) => item.id), [docs.ticket.id]);
    const several = await listFor([landlord], { resourceTypes: ['RENEWAL_NOTICE', 'MANAGEMENT_LOG'] });
    assert.deepEqual(new Set(several.map((item) => item.id)), new Set([docs.notice.id, docs.log.id]));
    const byTenant = await listFor([tenant]);
    assert.ok(byTenant.every((item) => item.uploader.id === tenant.id));
  });

  test('등록일은 KST 날짜 경계로 거른다(그날 포함)', async () => {
    const uploader = await createUser('LANDLORD');
    const lastMinute = await createDocument(uploader, 'CONTRACT', contract.id, { createdAt: new Date('2026-11-20T23:59:00+09:00') });
    const nextDay = await createDocument(uploader, 'CONTRACT', contract.id, { createdAt: new Date('2026-11-21T00:00:00+09:00') });
    const firstMinute = await createDocument(uploader, 'CONTRACT', contract.id, { createdAt: new Date('2026-11-19T00:00:00+09:00') });
    const dayBefore = await createDocument(uploader, 'CONTRACT', contract.id, { createdAt: new Date('2026-11-18T23:59:00+09:00') });
    const ids = (await listFor([uploader], { from: '2026-11-19', until: '2026-11-20' })).map((item) => item.id);
    assert.deepEqual(new Set(ids), new Set([lastMinute.id, firstMinute.id]));
    assert.equal(ids.includes(nextDay.id), false);
    assert.equal(ids.includes(dayBefore.id), false);
  });

  test('최신 등록 순으로 쪽을 나눈다', async () => {
    const all = await listFor([landlord]);
    const times = all.map((item) => item.createdAt);
    assert.deepEqual(times, [...times].sort().reverse());
    const first = await findAdminDocuments(query({ uploaderId: landlord.id, page: 1, size: 2 }));
    const second = await findAdminDocuments(query({ uploaderId: landlord.id, page: 2, size: 2 }));
    assert.equal(first.meta.total, all.length);
    assert.equal(first.meta.hasNext, true);
    assert.deepEqual([...first.items, ...second.items].map((item) => item.id), all.slice(0, 4).map((item) => item.id));
  });
});
