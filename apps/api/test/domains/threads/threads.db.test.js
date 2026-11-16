// 소통 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import {
  canViewMessage,
  findMessages,
  findThreadForUser,
  findThreads,
  lockWritableMessage,
  markThreadRead,
  openThread,
  sendMessage,
} from '../../../src/domains/threads/service.js';
import { createTicket, updateTicket } from '../../../src/domains/tickets/service.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const LIST_DEFAULTS = { contextType: null, contextId: null, page: 1, size: 20 };

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('소통 서비스', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  let unitSeq = 0;
  const createProperty = async () => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    return prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${4000 + unitSeq}` } });
  };
  const lease = (ownership, tenant, { start = -30, end = 300, terminatedOn = null } = {}) =>
    prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantId: tenant?.id ?? null,
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

  const setup = async (leaseOptions) => {
    const landlord = await fixture.createUser('LANDLORD');
    const tenant = await fixture.createUser('TENANT');
    const property = await createProperty();
    const ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: landlord.id } });
    const contract = await lease(ownership, tenant, leaseOptions);
    return { landlord, tenant, property, ownership, contract };
  };
  const contractThread = (user, contract) => openThread(user, { contextType: 'CONTRACT', contextId: contract.id });

  test('계약 스레드: 처음엔 201, 다시 열면 같은 스레드 200, 참여자는 임대인·임차인', async () => {
    const { landlord, tenant, contract, property } = await setup();
    const first = await contractThread(tenant, contract);
    assert.equal(first.created, true);
    assert.equal(first.thread.title, `101동 ${property.unitNo}호 계약`);
    assert.deepEqual(first.thread.participants.map((user) => user.id).sort(), [landlord.id, tenant.id].sort());
    assert.equal(first.thread.lastMessage, null);
    assert.equal(first.thread.unreadCount, 0);
    assert.equal(first.thread.isReadOnly, false);
    const again = await contractThread(landlord, contract);
    assert.equal(again.created, false);
    assert.equal(again.thread.id, first.thread.id);
  });

  test('남의 계약은 404, 임차인이 연결되지 않은 계약은 422', async () => {
    const { contract, ownership, landlord } = await setup();
    const stranger = await fixture.createUser('TENANT');
    await rejectsWith(contractThread(stranger, contract), 'CONTRACT_NOT_FOUND');
    const pending = await lease(ownership, null, { start: 400, end: 700 });
    await rejectsWith(contractThread(landlord, pending), 'THREAD_CONTEXT_NOT_SUPPORTED');
  });

  test('티켓 스레드: 임차인이 요청한 티켓만, 임대인이 직접 만든 티켓은 422', async () => {
    const { landlord, tenant, property } = await setup();
    const ticket = await createTicket(tenant, { propertyId: property.id, category: 'REPAIR', title: '보일러 누수', description: '물이 새요' });
    const { thread } = await openThread(landlord, { contextType: 'TICKET', contextId: ticket.id });
    assert.equal(thread.title, `101동 ${property.unitNo}호 · 보일러 누수`);
    const own = await createTicket(landlord, { propertyId: property.id, category: 'INSPECTION', title: '정기 점검', description: '소방' });
    await rejectsWith(openThread(landlord, { contextType: 'TICKET', contextId: own.id }), 'THREAD_CONTEXT_NOT_SUPPORTED');
  });

  test('메시지: 보내기·안 읽은 수·읽음 처리(앞으로만)', async () => {
    const { landlord, tenant, contract } = await setup();
    const { thread } = await contractThread(tenant, contract);
    const first = await sendMessage(tenant, thread.id, { body: '보일러에서 물이 새요.' });
    const second = await sendMessage(tenant, thread.id, { body: '사진 보냈습니다.' });
    assert.equal(first.sender.id, tenant.id);
    assert.equal(first.isHidden, false);

    assert.equal((await findThreadForUser(landlord, thread.id)).unreadCount, 2);
    assert.equal((await findThreadForUser(tenant, thread.id)).unreadCount, 0);

    await markThreadRead(landlord, thread.id, { lastReadMessageId: second.id });
    assert.equal((await findThreadForUser(landlord, thread.id)).unreadCount, 0);
    // 앞의 메시지로 되돌리지 않는다
    await markThreadRead(landlord, thread.id, { lastReadMessageId: first.id });
    assert.equal((await findThreadForUser(landlord, thread.id)).unreadCount, 0);

    const reply = await sendMessage(landlord, thread.id, { body: '내일 오전에 업체 부를게요.' });
    const view = await findThreadForUser(tenant, thread.id);
    assert.equal(view.unreadCount, 1);
    assert.equal(view.lastMessage.id, reply.id);
  });

  test('메시지 목록: cursor로 지난 메시지(최신순), after로 새 메시지(오래된 순)', async () => {
    const { tenant, landlord, contract } = await setup();
    const { thread } = await contractThread(tenant, contract);
    const sent = [];
    for (let index = 0; index < 5; index += 1) sent.push(await sendMessage(index % 2 ? landlord : tenant, thread.id, { body: `메시지 ${index}` }));

    const page1 = await findMessages(tenant, thread.id, { cursor: null, after: null, size: 2 });
    assert.deepEqual(page1.items.map((item) => item.body), ['메시지 4', '메시지 3']);
    assert.equal(page1.meta.hasNext, true);
    const { decodeCreatedAtCursor } = await import('../../../src/platform/createdAtCursor.js');
    const page2 = await findMessages(tenant, thread.id, { cursor: decodeCreatedAtCursor(page1.meta.nextCursor), after: null, size: 2 });
    assert.deepEqual(page2.items.map((item) => item.body), ['메시지 2', '메시지 1']);

    const newer = await findMessages(tenant, thread.id, { cursor: null, after: sent[2].id, size: 30 });
    assert.deepEqual(newer.items.map((item) => item.body), ['메시지 3', '메시지 4']);
    assert.deepEqual(newer.meta, { nextCursor: null, hasNext: false });

    const other = await setup();
    const { thread: otherThread } = await contractThread(other.tenant, other.contract);
    await rejectsWith(findMessages(tenant, otherThread.id, { cursor: null, after: null, size: 30 }), 'THREAD_NOT_FOUND');
    await rejectsWith(findMessages(other.tenant, otherThread.id, { cursor: null, after: sent[0].id, size: 30 }), 'MESSAGE_NOT_FOUND');
  });

  test('목록은 참여한 것만, 최근 메시지 순', async () => {
    const { tenant, landlord, contract, ownership } = await setup();
    const quiet = await contractThread(tenant, contract);
    const secondTenant = await fixture.createUser('TENANT');
    const secondContract = await lease(ownership, secondTenant, { start: 400, end: 700 });
    const busy = await contractThread(landlord, secondContract);
    await sendMessage(secondTenant, busy.thread.id, { body: '입주 전 확인할게요' });

    const mine = await findThreads(landlord, LIST_DEFAULTS);
    assert.deepEqual(mine.items.map((item) => item.id), [busy.thread.id, quiet.thread.id]);
    assert.equal((await findThreads(tenant, LIST_DEFAULTS)).meta.total, 1);
    const filtered = await findThreads(landlord, { ...LIST_DEFAULTS, contextType: 'CONTRACT', contextId: contract.id });
    assert.deepEqual(filtered.items.map((item) => item.id), [quiet.thread.id]);
  });

  test('보는 범위: 참여자·운영자만, 다른 사람은 404', async () => {
    const { tenant, contract } = await setup();
    const { thread } = await contractThread(tenant, contract);
    const stranger = await fixture.createUser('LANDLORD');
    const admin = await fixture.createUser('ADMIN');
    await rejectsWith(findThreadForUser(stranger, thread.id), 'THREAD_NOT_FOUND');
    await rejectsWith(sendMessage(stranger, thread.id, { body: '안녕' }), 'THREAD_NOT_FOUND');
    assert.equal((await findThreadForUser(admin, thread.id)).unreadCount, 0);
  });

  test('읽기 전용: 계약이 끝나고 30일이 지났거나 소유가 끝나면 보낼 수 없다', async () => {
    const old = await setup({ start: -400, end: -40 });
    const { thread } = await contractThread(old.tenant, old.contract);
    assert.equal(thread.isReadOnly, true);
    await rejectsWith(sendMessage(old.tenant, thread.id, { body: '보증금 문의' }), 'THREAD_READ_ONLY');

    const recent = await setup({ start: -400, end: -10 });
    const recentThread = (await contractThread(recent.tenant, recent.contract)).thread;
    assert.equal(recentThread.isReadOnly, false);

    const sold = await setup();
    const soldThread = (await contractThread(sold.tenant, sold.contract)).thread;
    await prisma.ownership.update({ where: { id: sold.ownership.id }, data: { endedAt: new Date(), endReason: 'SELF_ENDED' } });
    await rejectsWith(sendMessage(sold.landlord, soldThread.id, { body: '안녕하세요' }), 'THREAD_READ_ONLY');
  });

  test('티켓이 끝나도 30일 안에는 대화할 수 있다', async () => {
    const { landlord, tenant, property } = await setup();
    const ticket = await createTicket(tenant, { propertyId: property.id, category: 'REPAIR', title: '수전', description: '샘' });
    const { thread } = await openThread(tenant, { contextType: 'TICKET', contextId: ticket.id });
    await updateTicket(landlord, ticket.id, { status: 'DONE' });
    const message = await sendMessage(tenant, thread.id, { body: '고쳐 주셔서 감사합니다' });
    assert.equal(message.body, '고쳐 주셔서 감사합니다');
  });

  test('숨긴 메시지는 body null, 첨부는 운영자만, 보낸 메시지의 첨부는 바꿀 수 없다', async () => {
    const { landlord, tenant, contract } = await setup();
    const { thread } = await contractThread(tenant, contract);
    const message = await sendMessage(tenant, thread.id, { body: '연락처 010-...' });
    await prisma.threadMessage.update({ where: { id: message.id }, data: { isHidden: true, hiddenAt: new Date() } });
    const { items } = await findMessages(landlord, thread.id, { cursor: null, after: null, size: 30 });
    assert.equal(items[0].body, null);
    assert.equal(items[0].isHidden, true);
    assert.equal(await canViewMessage(landlord, message.id), false);
    assert.equal(await canViewMessage({ id: 'x', role: 'ADMIN' }, message.id), true);

    const visible = await sendMessage(tenant, thread.id, { body: '사진입니다' });
    assert.equal(await canViewMessage(landlord, visible.id), true);
    await rejectsWith(prisma.$transaction((tx) => lockWritableMessage(tx, tenant, visible.id)), 'THREAD_READ_ONLY');
    const stranger = await fixture.createUser('TENANT');
    await rejectsWith(prisma.$transaction((tx) => lockWritableMessage(tx, stranger, visible.id)), 'MESSAGE_NOT_FOUND');
  });
});
