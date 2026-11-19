// 통합 검색 API(api-contract.md 7장 v1.1, #172, 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { getTodayKST, addDaysToDateString } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const day = (value) => new Date(`${value}T00:00:00Z`);

describe('통합 검색 API', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  let server;
  let origin;
  // 단지명이 다른 테스트 데이터와 겹치지 않게 실행마다 새 이름
  const complexName = `검색테스트${randomUUID().slice(0, 6)}`;
  let landlord;
  let otherLandlord;
  let tenant;
  let property101;
  let property102;
  let contract;

  const createUser = async (role) => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  const createDocument = async (user, resourceType, resourceId, fileName) => {
    const upload = await prisma.upload.create({
      data: {
        userId: user.id,
        fileName,
        mimeType: 'image/jpeg',
        sizeBytes: 10n,
        type: 'RECEIPT',
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
        resourceType,
        resourceId,
        storagePath: upload.storagePath,
        fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        attachedAt: new Date(),
      },
    });
  };

  before(async () => {
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;

    landlord = await createUser('LANDLORD');
    otherLandlord = await createUser('LANDLORD');
    tenant = await createUser('TENANT');
    const complex = await fixture.createComplex({ name: complexName });
    property101 = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: '101' } });
    property102 = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: '102' } });
    const ownership101 = await prisma.ownership.create({ data: { propertyId: property101.id, userId: landlord.id } });
    const ownership102 = await prisma.ownership.create({ data: { propertyId: property102.id, userId: landlord.id } });

    const today = getTodayKST();
    contract = await prisma.contract.create({
      data: {
        ownershipId: ownership101.id,
        tenantId: tenant.id,
        tenantName: '김세입',
        tenantPhone: '01012345678',
        leaseType: 'JEONSE',
        deposit: 50000000n,
        monthlyRent: 0n,
        startDate: day(addDaysToDateString(today, -300)),
        endDate: day(addDaysToDateString(today, 30)),
      },
    });

    await prisma.propertyLog.create({
      data: { propertyId: property101.id, ownershipId: ownership101.id, authorId: landlord.id, scope: 'PRIVATE', type: 'REPAIR', title: '101호 보일러 수리 완료', occurredOn: day(today) },
    });
    await prisma.propertyLog.create({
      data: { propertyId: property102.id, ownershipId: ownership102.id, authorId: landlord.id, scope: 'PRIVATE', type: 'REPAIR', title: '102호 보일러 교체', occurredOn: day(today) },
    });
    const ticket = await prisma.ticket.create({
      data: {
        propertyId: property101.id,
        ownershipId: ownership101.id,
        contractId: contract.id,
        requesterId: tenant.id,
        category: 'REPAIR',
        title: '보일러 누수 수리 요청',
        description: '물이 새요',
      },
    });
    await createDocument(landlord, 'OWNERSHIP', ownership101.id, '보일러 수리 영수증.jpg');
    await createDocument(tenant, 'TICKET', ticket.id, '보일러 누수 사진.jpg');

    // 다른 임대인의 같은 단지 호실 — 결과에 나오면 안 된다
    const otherProperty = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '102', unitNo: '101' } });
    const otherOwnership = await prisma.ownership.create({ data: { propertyId: otherProperty.id, userId: otherLandlord.id } });
    await prisma.propertyLog.create({
      data: { propertyId: otherProperty.id, ownershipId: otherOwnership.id, authorId: otherLandlord.id, scope: 'PRIVATE', type: 'REPAIR', title: '보일러 남의 기록', occurredOn: day(today) },
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const documents = await prisma.document.findMany({ where: { uploaderId: { in: userIds } }, select: { uploadId: true } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { id: { in: documents.map((document) => document.uploadId) } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await fixture.cleanup();
  });

  const search = async (user, query) => {
    const response = await fetch(`${origin}/api/v1/search?${new URLSearchParams(query)}`, {
      headers: { Cookie: `access_token=${signAccessToken(user)}` },
    });
    return { status: response.status, body: await response.json() };
  };

  test('임대인: "101호 보일러"는 101호와 그 호실의 보일러 항목만', async () => {
    const { status, body } = await search(landlord, { query: '101호 보일러' });
    assert.equal(status, 200);
    const { data } = body;
    assert.deepEqual(data.properties.map((item) => item.id), [property101.id]);
    assert.equal(data.properties[0].currentContract.id, contract.id);
    assert.equal(data.properties[0].currentContract.deposit, 50000000);
    assert.deepEqual(data.managementLogs.map((item) => item.title), ['101호 보일러 수리 완료']);
    assert.deepEqual(data.tickets.map((item) => item.title), ['보일러 누수 수리 요청']);
    assert.deepEqual(data.documents.map((item) => item.fileName), ['보일러 수리 영수증.jpg']);
    assert.equal(data.documents[0].property.id, property101.id);
    assert.deepEqual(data.contracts, []);
  });

  test('임대인: 호실 조건 없이 키워드만이면 모든 내 호실에서, 남의 기록은 없다', async () => {
    const { body } = await search(landlord, { query: '보일러', types: 'MANAGEMENT_LOG,PROPERTY' });
    assert.deepEqual(body.data.managementLogs.map((item) => item.title).sort(), ['101호 보일러 수리 완료', '102호 보일러 교체']);
    assert.deepEqual(body.data.properties, []);
    assert.deepEqual(body.data.tickets, []);
  });

  test('임대인: 임차인 이름으로 계약, 일정은 제목으로', async () => {
    const byName = await search(landlord, { query: '김세입' });
    assert.deepEqual(byName.body.data.contracts.map((item) => item.id), [contract.id]);
    assert.equal(byName.body.data.contracts[0].status, 'EXPIRING_SOON');
    const bySchedule = await search(landlord, { query: `${complexName} 만기`, types: 'SCHEDULE' });
    assert.deepEqual(bySchedule.body.data.schedules.map((item) => item.title), ['계약 만기']);
  });

  test('임차인: 관리 로그·계약은 비고, 내 호실·티켓·티켓 첨부만', async () => {
    const { body } = await search(tenant, { query: '101호 보일러' });
    assert.deepEqual(body.data.properties.map((item) => item.id), [property101.id]);
    assert.deepEqual(body.data.managementLogs, []);
    assert.deepEqual(body.data.contracts, []);
    assert.deepEqual(body.data.tickets.map((item) => item.title), ['보일러 누수 수리 요청']);
    assert.deepEqual(body.data.documents.map((item) => item.fileName), ['보일러 누수 사진.jpg']);
  });

  test('어느 호실에도 맞지 않는 단어는 키워드가 된다', async () => {
    const { body } = await search(landlord, { query: '101동 999호' });
    assert.deepEqual(body.data.properties.map((item) => item.unitNo), ['101', '102']);
    assert.deepEqual(body.data.managementLogs, []);
    assert.deepEqual(body.data.tickets, []);
  });

  test('호실 조건끼리 맞는 호실이 없으면 모두 빈 결과', async () => {
    const { body } = await search(landlord, { query: '101호 102호' });
    assert.ok(Object.values(body.data).every((items) => items.length === 0));
  });

  test('검사: 짧은 검색어 400, 운영자 403', async () => {
    const short = await search(landlord, { query: '가' });
    assert.equal(short.status, 400);
    assert.equal(short.body.error.code, 'VALIDATION_ERROR');
    const admin = await createUser('ADMIN');
    const forbidden = await search(admin, { query: '보일러' });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN_ROLE');
  });
});
