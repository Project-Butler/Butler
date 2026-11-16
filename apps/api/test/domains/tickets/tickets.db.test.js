// 티켓 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import {
  canViewTicket,
  createTicket,
  findTicketForUser,
  findTickets,
  lockWritableTicket,
  updateTicket,
} from '../../../src/domains/tickets/service.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const FUTURE_EXPIRY = new Date(Date.now() + 86400000 * 365);
const LIST_DEFAULTS = { propertyId: null, statuses: [], categories: [], sortDirection: 'desc', page: 1, size: 20 };
const input = (propertyId, overrides = {}) => ({
  propertyId,
  category: 'REPAIR',
  title: '보일러 누수',
  description: '보일러 아래로 물이 떨어져요',
  ...overrides,
});

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('티켓 서비스', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const testUserIds = [];
  const createUser = async (role) => {
    const user = await fixture.createUser(role);
    testUserIds.push(user.id);
    return user;
  };
  after(async () => {
    await prisma.auditLog.deleteMany({ where: { resourceType: 'TICKET', actorId: { in: testUserIds } } });
    await fixture.cleanup();
  });

  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${3000 + unitSeq}` } });
  };
  const own = (user, property, data = {}) => prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...data } });
  const lease = (ownership, tenant, { start = -30, end = 300, terminatedOn = null } = {}) =>
    prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantId: tenant.id,
        tenantName: '김임차',
        tenantPhone: '01000000000',
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        startDate: shift(start),
        endDate: shift(end),
        terminatedOn,
      },
    });

  // 임대인·임차인·진행 중 계약이 있는 호실
  const setup = async ({ verified = false } = {}) => {
    const landlord = await createUser('LANDLORD');
    const tenant = await createUser('TENANT');
    const property = await createProperty();
    const ownership = await own(landlord, property, verified ? { verificationStatus: 'VERIFIED', verificationExpiresAt: FUTURE_EXPIRY } : {});
    const contract = await lease(ownership, tenant);
    return { landlord, tenant, property, ownership, contract };
  };

  test('임차인 요청 → 계약·소유 관계에 연결, 응답 모양', async () => {
    const { landlord, tenant, property, ownership, contract } = await setup();
    const ticket = await createTicket(tenant, input(property.id));
    assert.equal(ticket.status, 'OPEN');
    assert.equal(ticket.contractId, contract.id);
    assert.equal(ticket.property.id, property.id);
    assert.equal(ticket.requester.id, tenant.id);
    assert.equal(ticket.cost, null);
    assert.equal(ticket.historyLogId, null);
    assert.deepEqual(ticket.attachments, []);
    assert.equal(ticket.isReadOnly, false);
    const row = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    assert.equal(row.ownershipId, ownership.id);
    assert.equal((await findTicketForUser(landlord, ticket.id)).id, ticket.id);
  });

  test('임대인 요청 → 본인 활성 소유 관계, contractId null', async () => {
    const { landlord, property } = await setup();
    const ticket = await createTicket(landlord, input(property.id, { category: 'INSPECTION' }));
    assert.equal(ticket.contractId, null);
    assert.equal(ticket.requester.id, landlord.id);
  });

  test('계약이 없거나 끝난 임차인, 남의 호실 임대인은 404 PROPERTY_NOT_FOUND', async () => {
    const { property, ownership } = await setup();
    const stranger = await createUser('TENANT');
    await rejectsWith(createTicket(stranger, input(property.id)), 'PROPERTY_NOT_FOUND');
    const expired = await createUser('TENANT');
    await lease(ownership, expired, { start: -400, end: -40 });
    await rejectsWith(createTicket(expired, input(property.id)), 'PROPERTY_NOT_FOUND');
    const terminated = await createUser('TENANT');
    await lease(ownership, terminated, { terminatedOn: shift(-1) });
    await rejectsWith(createTicket(terminated, input(property.id)), 'PROPERTY_NOT_FOUND');
    const otherLandlord = await createUser('LANDLORD');
    await rejectsWith(createTicket(otherLandlord, input(property.id)), 'PROPERTY_NOT_FOUND');
  });

  test('시작 전 계약의 임차인도 요청할 수 있다', async () => {
    const { property, ownership } = await setup();
    const upcoming = await createUser('TENANT');
    const contract = await lease(ownership, upcoming, { start: 400, end: 700 });
    const ticket = await createTicket(upcoming, input(property.id));
    assert.equal(ticket.contractId, contract.id);
  });

  test('보는 범위: 처리 소유자·요청자·운영자만, 다른 사람은 404', async () => {
    const { landlord, tenant, property } = await setup();
    const ticket = await createTicket(tenant, input(property.id));
    const stranger = await createUser('LANDLORD');
    const admin = await createUser('ADMIN');
    assert.equal(await findTicketForUser(stranger, ticket.id), null);
    assert.equal(await canViewTicket(stranger, ticket.id), false);
    assert.equal((await findTicketForUser(admin, ticket.id)).id, ticket.id);
    assert.equal(await canViewTicket(landlord, ticket.id), true);
    assert.equal((await findTickets(stranger, LIST_DEFAULTS)).meta.total, 0);
    await rejectsWith(updateTicket(stranger, ticket.id, { status: 'CANCELED' }), 'TICKET_NOT_FOUND');
  });

  test('목록 필터: 상태 여러 개, 호실', async () => {
    const { landlord, tenant, property } = await setup();
    const first = await createTicket(tenant, input(property.id));
    const second = await createTicket(tenant, input(property.id, { title: '욕실 실리콘' }));
    await updateTicket(landlord, second.id, { status: 'IN_PROGRESS' });
    const open = await findTickets(landlord, { ...LIST_DEFAULTS, propertyId: property.id, statuses: ['OPEN'] });
    assert.deepEqual(open.items.map((item) => item.id), [first.id]);
    const active = await findTickets(tenant, { ...LIST_DEFAULTS, propertyId: property.id, statuses: ['OPEN', 'IN_PROGRESS'] });
    assert.equal(active.meta.total, 2);
    assert.equal(active.items[0].id, second.id);
  });

  test('처리 시작 → 완료: 비용은 임대인에게만, 요약 관리 로그 생성, 감사 로그', async () => {
    const { landlord, tenant, property, ownership } = await setup({ verified: true });
    const ticket = await createTicket(tenant, input(property.id));
    const started = await updateTicket(landlord, ticket.id, { status: 'IN_PROGRESS' });
    assert.equal(started.status, 'IN_PROGRESS');
    const done = await updateTicket(landlord, ticket.id, { status: 'DONE', resolutionNote: '배관 교체', cost: 120000n });
    assert.equal(done.status, 'DONE');
    assert.equal(done.cost, 120000);
    assert.equal(done.isReadOnly, true);
    assert.ok(done.closedAt);
    assert.ok(done.historyLogId);

    const log = await prisma.propertyLog.findUnique({ where: { id: done.historyLogId } });
    assert.equal(log.type, 'TICKET_SUMMARY');
    assert.equal(log.scope, 'PROPERTY_HISTORY');
    assert.equal(log.ownershipId, ownership.id);
    assert.equal(log.authorId, null);
    assert.equal(log.title, '보일러 누수');
    assert.equal(log.content, '배관 교체');
    assert.equal(log.cost, 120000n);
    assert.equal(log.sourceResourceType, 'TICKET');
    // 임차인이 쓴 설명은 넘어가지 않는다
    assert.equal(log.content.includes('물이 떨어져요'), false);

    assert.equal((await findTicketForUser(tenant, ticket.id)).cost, null);
    const audits = await prisma.auditLog.count({ where: { resourceType: 'TICKET', resourceId: ticket.id, action: 'TICKET_STATUS_CHANGED' } });
    assert.equal(audits, 2);
  });

  test('인증 안 된 소유 관계의 완료 요약은 나만 보기', async () => {
    const { landlord, tenant, property } = await setup();
    const ticket = await createTicket(tenant, input(property.id));
    const done = await updateTicket(landlord, ticket.id, { status: 'DONE' });
    const log = await prisma.propertyLog.findUnique({ where: { id: done.historyLogId } });
    assert.equal(log.scope, 'PRIVATE');
  });

  test('요청자: OPEN일 때 제목 수정·취소 가능, 처리 상태·비용은 못 바꾼다', async () => {
    const { landlord, tenant, property } = await setup();
    const ticket = await createTicket(tenant, input(property.id));
    const edited = await updateTicket(tenant, ticket.id, { title: '보일러 누수 (사진 추가)' });
    assert.equal(edited.title, '보일러 누수 (사진 추가)');
    await rejectsWith(updateTicket(tenant, ticket.id, { status: 'IN_PROGRESS' }), 'TICKET_INVALID_TRANSITION');
    await rejectsWith(updateTicket(tenant, ticket.id, { cost: 1000n }), 'TICKET_READ_ONLY');
    await updateTicket(landlord, ticket.id, { status: 'IN_PROGRESS' });
    await rejectsWith(updateTicket(tenant, ticket.id, { description: '바꿈' }), 'TICKET_READ_ONLY');
    const canceled = await updateTicket(tenant, ticket.id, { status: 'CANCELED' });
    assert.equal(canceled.status, 'CANCELED');
    assert.equal(canceled.historyLogId, null);
  });

  test('끝 상태·잘못된 전이·소유가 끝난 소유자', async () => {
    const { landlord, tenant, property, ownership } = await setup();
    const ticket = await createTicket(tenant, input(property.id));
    await rejectsWith(updateTicket(landlord, ticket.id, { title: '임대인이 고침' }), 'TICKET_READ_ONLY');
    await updateTicket(landlord, ticket.id, { status: 'IN_PROGRESS' });
    await rejectsWith(updateTicket(landlord, ticket.id, { status: 'OPEN' }), 'TICKET_INVALID_TRANSITION');

    const second = await createTicket(tenant, input(property.id));
    await prisma.ownership.update({ where: { id: ownership.id }, data: { endedAt: new Date(), endReason: 'SELF_ENDED' } });
    await rejectsWith(updateTicket(landlord, second.id, { status: 'DONE' }), 'TICKET_INVALID_TRANSITION');
    await rejectsWith(updateTicket(landlord, second.id, { cost: 1n }), 'TICKET_READ_ONLY');
    // 소유가 끝나도 본인 티켓은 읽기 전용으로 본다
    assert.equal((await findTicketForUser(landlord, second.id)).isReadOnly, true);

    await updateTicket(tenant, second.id, { status: 'CANCELED' });
    await rejectsWith(updateTicket(tenant, second.id, { status: 'CANCELED' }), 'TICKET_READ_ONLY');
  });

  test('첨부 잠금: 요청자는 OPEN일 때만, 끝난 티켓은 아무도', async () => {
    const { landlord, tenant, property } = await setup();
    const ticket = await createTicket(tenant, input(property.id));
    await prisma.$transaction((tx) => lockWritableTicket(tx, tenant, ticket.id));
    await updateTicket(landlord, ticket.id, { status: 'IN_PROGRESS' });
    await rejectsWith(prisma.$transaction((tx) => lockWritableTicket(tx, tenant, ticket.id)), 'TICKET_READ_ONLY');
    await prisma.$transaction((tx) => lockWritableTicket(tx, landlord, ticket.id));
    await updateTicket(landlord, ticket.id, { status: 'DONE' });
    await rejectsWith(prisma.$transaction((tx) => lockWritableTicket(tx, landlord, ticket.id)), 'TICKET_READ_ONLY');
  });
});
