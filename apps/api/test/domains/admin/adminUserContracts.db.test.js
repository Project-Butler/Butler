// 관리자 회원 상세의 소유 관계별 계약 요약(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { findAdminUser } from '../../../src/domains/admin/service.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const contractRow = (ownershipId, startDate, endDate, overrides = {}) => ({
  ownershipId,
  leaseType: 'MONTHLY',
  deposit: 50000000n,
  monthlyRent: 800000n,
  startDate: new Date(`${startDate}T00:00:00Z`),
  endDate: new Date(`${endDate}T00:00:00Z`),
  tenantName: '이임차',
  tenantPhone: '01098765432',
  memo: '관리비 별도',
  ...overrides,
});

describe('관리자 회원 상세 계약 요약', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  const createOwnership = async (user, unitNo) => {
    const complex = await fixture.createComplex();
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo } });
    return prisma.ownership.create({ data: { propertyId: property.id, userId: user.id } });
  };

  test('소유 관계마다 최근 시작 순으로 id·status·기간만 담고, 계약이 없으면 빈 배열이다', async () => {
    const user = await fixture.createUser();
    const withContracts = await createOwnership(user, '2001');
    const withoutContracts = await createOwnership(user, '2002');
    const older = await prisma.contract.create({
      data: contractRow(withContracts.id, '2020-01-01', '2021-12-31', { terminatedOn: new Date('2021-06-30T00:00:00Z') }),
    });
    const newer = await prisma.contract.create({ data: contractRow(withContracts.id, '2098-01-01', '2099-12-31') });

    const detail = await findAdminUser(user.id);
    const summary = detail.ownerships.find((item) => item.id === withContracts.id);

    assert.deepEqual(summary.contracts, [
      { id: newer.id, status: 'UPCOMING', startDate: '2098-01-01', endDate: '2099-12-31' },
      { id: older.id, status: 'TERMINATED', startDate: '2020-01-01', endDate: '2021-12-31' },
    ]);
    assert.deepEqual(detail.ownerships.find((item) => item.id === withoutContracts.id).contracts, []);
  });
});
