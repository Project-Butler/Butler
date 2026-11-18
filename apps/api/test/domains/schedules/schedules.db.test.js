// 일정 조회 API(api-contract.md 7장, #161, 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const day = (value) => new Date(`${value}T00:00:00Z`);

describe('일정 조회 API', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
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
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await fixture.cleanup();
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  const get = async (user, query) => {
    const response = await fetch(`${origin}/api/v1/schedules?${new URLSearchParams(query)}`, {
      headers: user ? { Cookie: `access_token=${signAccessToken(user)}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };

  let unitSeq = 0;
  // 2025-12-01~2027-11-30 월세 계약, 입금일 25일 → 통지 마감 2027-09-30
  const createContract = async (landlord, overrides = {}) => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${4000 + unitSeq}` } });
    const ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: landlord.id } });
    const contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantName: '이임차',
        tenantPhone: '01098765432',
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        rentPaymentDay: 25,
        startDate: day('2025-12-01'),
        endDate: day('2027-11-30'),
        ...overrides,
      },
    });
    return { contract, ownership };
  };

  const RANGE = { fromDate: '2027-09-01', toDate: '2027-11-30' };
  const kindsDates = (body) => body.data.map((item) => `${item.kind}:${item.date}`);

  test('임대인: 기간 안의 입금일·통지 마감·만기를 날짜순으로, 임차인: 만기만', async () => {
    const landlord = await createUser();
    const tenant = await createUser('TENANT');
    const { contract } = await createContract(landlord, { tenantId: tenant.id });

    const mine = await get(landlord, RANGE);
    assert.equal(mine.status, 200);
    assert.deepEqual(kindsDates(mine.body), [
      'RENT_PAYMENT:2027-09-25',
      'RENEWAL_NOTICE_DEADLINE:2027-09-30',
      'RENT_PAYMENT:2027-10-25',
      'RENT_PAYMENT:2027-11-25',
      'CONTRACT_END:2027-11-30',
    ]);
    assert.equal(mine.body.data[0].amount, 500000);
    assert.deepEqual(mine.body.data[0].related, { resourceType: 'CONTRACT', resourceId: contract.id });

    assert.deepEqual(kindsDates((await get(tenant, RANGE)).body), ['CONTRACT_END:2027-11-30']);
    assert.deepEqual((await get(await createUser(), RANGE)).body.data, []);
  });

  test('해지한 계약·끝난 소유 관계는 나오지 않는다', async () => {
    const landlord = await createUser();
    const terminated = await createContract(landlord);
    await prisma.contract.update({ where: { id: terminated.contract.id }, data: { terminatedOn: day('2027-01-01') } });
    const ended = await createContract(landlord);
    await prisma.ownership.update({ where: { id: ended.ownership.id }, data: { endedAt: new Date(), endReason: 'SOLD' } });
    assert.deepEqual((await get(landlord, RANGE)).body.data, []);
  });

  test('기간 검사: 빠지거나 틀린 날짜·뒤집힌 기간은 400, 93일 넘으면 422, 로그인 안 하면 401', async () => {
    const user = await createUser();
    assert.equal((await get(user, { fromDate: '2027-09-01' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await get(user, { fromDate: '2027-02-30', toDate: '2027-03-01' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await get(user, { fromDate: '2027-09-02', toDate: '2027-09-01' })).body.error.code, 'VALIDATION_ERROR');
    // 2027-09-01~2027-12-02는 93일(통과), 12-03은 94일
    assert.equal((await get(user, { fromDate: '2027-09-01', toDate: '2027-12-02' })).status, 200);
    const tooLong = await get(user, { fromDate: '2027-09-01', toDate: '2027-12-03' });
    assert.equal(tooLong.status, 422);
    assert.equal(tooLong.body.error.code, 'SCHEDULE_RANGE_TOO_LONG');
    assert.equal((await get(null, RANGE)).status, 401);
  });
});
