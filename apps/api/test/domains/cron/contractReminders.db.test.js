// 계약 일정 알림 정기 작업(#159, 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 오늘 날짜를 바꿔 가며 runContractReminders를 직접 부른다.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { runContractReminders } from '../../../src/domains/cron/contractReminders.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const day = (value) => new Date(`${value}T00:00:00Z`);

describe('계약 일정 알림 정기 작업', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  // 다른 테스트 파일이 동시에 만들고 지우는 계약에 알림을 쓰지 않게, 이 파일이 만든 임대인 계약으로만 좁혀 실행한다.
  const landlordIds = [];
  const run = (todayKST) => runContractReminders({ todayKST, landlordIds });

  let unitSeq = 0;
  // 2025-12-01~2027-11-30 월세 계약, 입금일 25일 → 통지 구간 2027-05-30~2027-09-30
  const createContract = async () => {
    const user = await fixture.createUser('LANDLORD');
    landlordIds.push(user.id);
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${3000 + unitSeq}` } });
    const ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: user.id } });
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
      },
    });
    return { user, contract, ownership };
  };

  // 다른 테스트 파일이 만든 계약도 함께 읽히므로, 이 사용자 알림만 본다.
  const typesFor = async (user) =>
    (await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } })).map((row) => row.type);

  test('같은 날 두 번 실행해도 알림은 한 번, 다음 단계에서 새로 간다', async () => {
    const { user } = await createContract();
    await run('2027-05-30');
    await run('2027-05-30');
    assert.deepEqual(await typesFor(user), ['RENEWAL_NOTICE_WINDOW_OPEN']);

    // 다음 날도 같은 구간 시작 알림 키라 더 만들지 않는다
    await run('2027-05-31');
    assert.deepEqual(await typesFor(user), ['RENEWAL_NOTICE_WINDOW_OPEN']);

    // 입금일
    await run('2027-06-25');
    assert.deepEqual(await typesFor(user), ['RENEWAL_NOTICE_WINDOW_OPEN', 'RENT_PAYMENT_DUE']);

    // 마감 7일 전: 만료 임박(120일 이하)과 마감 D7
    await run('2027-09-23');
    assert.deepEqual(await typesFor(user), [
      'CONTRACT_EXPIRING_SOON',
      'RENEWAL_NOTICE_DEADLINE_SOON',
      'RENEWAL_NOTICE_WINDOW_OPEN',
      'RENT_PAYMENT_DUE',
    ]);
  });

  test('기한 안 도달 기록이 있거나 그 type을 끈 사용자에게는 보내지 않는다', async () => {
    const { user, contract } = await createContract();
    await prisma.renewalNotice.create({
      data: {
        contractId: contract.id,
        authorId: user.id,
        kind: 'REFUSE_RENEWAL',
        method: 'CERTIFIED_MAIL',
        sentOn: day('2027-06-01'),
        deliveredOn: day('2027-06-02'),
      },
    });
    await prisma.notificationPreference.create({ data: { userId: user.id, mutedTypes: ['RENT_PAYMENT_DUE'] } });
    await run('2027-09-25');
    assert.deepEqual(await typesFor(user), ['CONTRACT_EXPIRING_SOON']);
  });

  // 2027-12-01~2029-11-30 다음 계약. previous면 갱신 계약, 아니면 새 임차인 계약.
  const createNextContract = (ownership, { previous = null, terminatedOn = null } = {}) =>
    prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        tenantName: previous ? '이임차' : '김새입',
        tenantPhone: '01011112222',
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        startDate: day('2027-12-01'),
        endDate: day('2029-11-30'),
        previousContractId: previous?.id ?? null,
        terminatedOn,
      },
    });

  test('갱신 계약이 등록되면 통지 알림을 보내지 않는다. 취소한 갱신 계약·새 임차인 계약은 그대로 보낸다(#242)', async () => {
    const renewed = await createContract();
    await createNextContract(renewed.ownership, { previous: renewed.contract });
    const canceled = await createContract();
    await createNextContract(canceled.ownership, { previous: canceled.contract, terminatedOn: day('2027-08-01') });
    const newTenant = await createContract();
    await createNextContract(newTenant.ownership);

    await run('2027-09-23');
    assert.deepEqual(await typesFor(renewed.user), ['CONTRACT_EXPIRING_SOON']);
    assert.deepEqual(await typesFor(canceled.user), ['CONTRACT_EXPIRING_SOON', 'RENEWAL_NOTICE_DEADLINE_SOON']);
    assert.deepEqual(await typesFor(newTenant.user), ['CONTRACT_EXPIRING_SOON', 'RENEWAL_NOTICE_DEADLINE_SOON']);
  });

  test('해지한 계약과 끝난 소유 관계는 읽지 않는다', async () => {
    const terminated = await createContract();
    await prisma.contract.update({ where: { id: terminated.contract.id }, data: { terminatedOn: day('2027-01-01') } });
    const ended = await createContract();
    await prisma.ownership.update({ where: { id: ended.ownership.id }, data: { endedAt: new Date(), endReason: 'SOLD' } });
    await run('2027-09-25');
    assert.deepEqual(await typesFor(terminated.user), []);
    assert.deepEqual(await typesFor(ended.user), []);
  });
});
