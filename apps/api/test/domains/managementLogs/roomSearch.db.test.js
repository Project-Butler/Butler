// 하우스 로그 방 태그·검색(하우스 로그 개편 H-02·H-03·H-04, 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { appendPropertyHistory } from '../../../src/platform/propertyHistory.js';
import {
  createManagementLog,
  findManagementLogs,
  findPropertyManagementLogs,
  updateManagementLog,
} from '../../../src/domains/managementLogs/service.js';
import { createTicket, findTickets, updateTicket } from '../../../src/domains/tickets/service.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const LOG_LIST = { propertyId: null, scope: null, types: [], rooms: [], q: null, until: null, sortDirection: 'desc', page: 1, size: 20 };
const TICKET_LIST = { propertyId: null, statuses: [], categories: [], rooms: [], sortDirection: 'desc', page: 1, size: 20 };
const logInput = (overrides = {}) => ({ type: 'REPAIR', title: '기록', occurredOn: TODAY, ...overrides });

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('하우스 로그 방·검색', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const testUserIds = [];
  const createUser = async (role) => {
    const user = await fixture.createUser(role);
    testUserIds.push(user.id);
    return user;
  };
  after(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: testUserIds } } });
    await fixture.cleanup();
  });

  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '102', unitNo: `${5000 + unitSeq}` } });
  };
  const own = (user, property) => prisma.ownership.create({ data: { propertyId: property.id, userId: user.id } });
  const titles = (page) => page.items.map((log) => log.title);

  test('방 저장 왕복: 작성·수정·목록 응답, 감사·활동 칸 이름 "방"', async () => {
    const user = await createUser();
    const property = await createProperty();
    await own(user, property);
    const created = await createManagementLog(user, property.id, logInput({ title: '주방 수전', room: 'KITCHEN' }));
    assert.equal(created.room, 'KITCHEN');
    const none = await createManagementLog(user, property.id, logInput({ title: '방 없음' }));
    assert.equal(none.room, null);

    const updated = await updateManagementLog(user, created.id, { room: 'BATHROOM' });
    assert.equal(updated.room, 'BATHROOM');
    const activity = await prisma.activity.findFirst({
      where: { userId: user.id, type: 'MANAGEMENT_LOG_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.deepEqual(activity.params.fields, ['room']);

    // 같은 값을 다시 보내면 바뀐 것이 없다
    await updateManagementLog(user, created.id, { room: 'BATHROOM' });
    assert.equal(await prisma.activity.count({ where: { userId: user.id, type: 'MANAGEMENT_LOG_UPDATED' } }), 1);
  });

  test('목록 room 필터: 방 여러 개, NONE(방 없음), L-02에서도', async () => {
    const user = await createUser();
    const property = await createProperty();
    await own(user, property);
    await createManagementLog(user, property.id, logInput({ title: '주방', room: 'KITCHEN' }));
    await createManagementLog(user, property.id, logInput({ title: '욕실', room: 'BATHROOM' }));
    await createManagementLog(user, property.id, logInput({ title: '없음' }));

    const kitchenOrNone = await findManagementLogs(user, { ...LOG_LIST, rooms: ['KITCHEN', 'NONE'] });
    assert.deepEqual(titles(kitchenOrNone).sort(), ['없음', '주방']);
    const bath = await findPropertyManagementLogs(user, property.id, { ...LOG_LIST, rooms: ['BATHROOM'] });
    assert.deepEqual(titles(bath), ['욕실']);
  });

  test('L-02 until: 미래 예정 기록을 뺀다', async () => {
    const user = await createUser();
    const property = await createProperty();
    await own(user, property);
    await createManagementLog(user, property.id, logInput({ title: '오늘' }));
    await createManagementLog(user, property.id, logInput({ title: '다음 주', occurredOn: shift(7) }));
    const page = await findPropertyManagementLogs(user, property.id, { ...LOG_LIST, until: TODAY, size: 1 });
    assert.deepEqual(titles(page), ['오늘']);
  });

  test('검색 q: 낱말이 모두 제목·내용에 있어야, 대소문자 무시, 남의 나만 보기는 안 나옴', async () => {
    const user = await createUser();
    const stranger = await createUser();
    const property = await createProperty();
    await own(user, property);
    const strangerUnit = await createProperty();
    await own(stranger, strangerUnit);
    await createManagementLog(user, property.id, logInput({ title: '보일러 점검', content: 'Rinnai 정기 점검' }));
    await createManagementLog(user, property.id, logInput({ title: '보일러 교체' }));
    await createManagementLog(stranger, strangerUnit.id, logInput({ title: '보일러 점검' }));

    assert.deepEqual(titles(await findManagementLogs(user, { ...LOG_LIST, q: '보일러' })).sort(), ['보일러 교체', '보일러 점검']);
    assert.deepEqual(titles(await findManagementLogs(user, { ...LOG_LIST, q: '보일러 rinnai' })), ['보일러 점검']);
    assert.deepEqual(titles(await findManagementLogs(user, { ...LOG_LIST, q: '보일러 누수' })), []);
  });

  test('수리 요청 방: 만들기·목록 필터·요청자 수정 규칙·완료 요약에 그대로(H-03·H-20)', async () => {
    const landlord = await createUser('LANDLORD');
    const property = await createProperty();
    await own(landlord, property);
    const ticket = await createTicket(landlord, {
      propertyId: property.id,
      category: 'REPAIR',
      title: '주방 수전에서 물이 새요',
      description: '싱크대 아래',
      room: 'KITCHEN',
    });
    assert.equal(ticket.room, 'KITCHEN');
    const other = await createTicket(landlord, { propertyId: property.id, category: 'REPAIR', title: '방 없음', description: '설명', room: null });
    assert.equal(other.room, null);

    const kitchen = await findTickets(landlord, { ...TICKET_LIST, propertyId: property.id, rooms: ['KITCHEN'] });
    assert.deepEqual(kitchen.items.map((item) => item.id), [ticket.id]);
    const none = await findTickets(landlord, { ...TICKET_LIST, propertyId: property.id, rooms: ['NONE'] });
    assert.deepEqual(none.items.map((item) => item.id), [other.id]);

    // 활성 소유자는 처리 중에도 방을 바꾼다
    await updateTicket(landlord, ticket.id, { status: 'IN_PROGRESS' });
    const moved = await updateTicket(landlord, ticket.id, { room: 'BATHROOM' });
    assert.equal(moved.room, 'BATHROOM');

    const done = await updateTicket(landlord, ticket.id, { status: 'DONE' });
    const log = await prisma.propertyLog.findUnique({ where: { id: done.historyLogId } });
    assert.equal(log.type, 'TICKET_SUMMARY');
    assert.equal(log.room, 'BATHROOM');
  });

  test('수리 요청 방: 임차인 요청자는 처리가 시작되면 못 바꾼다', async () => {
    const landlord = await createUser('LANDLORD');
    const tenant = await createUser('TENANT');
    const property = await createProperty();
    const ownership = await own(landlord, property);
    const start = new Date(`${shift(-30)}T00:00:00Z`);
    const end = new Date(`${shift(300)}T00:00:00Z`);
    await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantId: tenant.id,
        tenantName: '테스트',
        tenantPhone: '01000000000',
        leaseType: 'MONTHLY',
        deposit: 1000000n,
        monthlyRent: 100000n,
        startDate: start,
        endDate: end,
      },
    });
    const ticket = await createTicket(tenant, { propertyId: property.id, category: 'REPAIR', title: '욕실', description: '설명' });
    assert.equal((await updateTicket(tenant, ticket.id, { room: 'BATHROOM' })).room, 'BATHROOM');
    await updateTicket(landlord, ticket.id, { status: 'IN_PROGRESS' });
    await rejectsWith(updateTicket(tenant, ticket.id, { room: 'KITCHEN' }), 'TICKET_READ_ONLY');
  });

  test('appendPropertyHistory: room을 넘기면 저장, 안 넘기면 null', async () => {
    const user = await createUser();
    const property = await createProperty();
    const ownership = await own(user, property);
    const source = { feature: 'test', resourceType: null, resourceId: null };
    const withRoom = await appendPropertyHistory({
      propertyId: property.id,
      ownershipId: ownership.id,
      type: 'NOTE',
      title: '시스템',
      occurredOn: TODAY,
      room: 'LIVING',
      source,
    });
    assert.equal(withRoom.room, 'LIVING');
    const without = await appendPropertyHistory({ propertyId: property.id, ownershipId: ownership.id, type: 'NOTE', title: '시스템2', occurredOn: TODAY, source });
    assert.equal(without.room, null);
  });
});
