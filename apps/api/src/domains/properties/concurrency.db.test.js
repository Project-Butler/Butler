// 호실 등록·정원 동시성(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { prisma } from '../../platform/prismaClient.js';
import { createLandlordBuilding, updateLandlordBuilding } from '../landlordBuildings/service.js';
import { createPropertyWithOwnership } from './service.js';

const unitInput = (complexId, unitNo) => ({
  complexId,
  buildingNo: '101',
  unitNo,
  exclusiveArea: null,
  floor: null,
  acquiredYearMonth: null,
  purchasePrice: null,
  listing: {},
});

const activeCount = (userId, complexId) =>
  prisma.propertyOwnership.count({ where: { userId, endedAt: null, property: { complexId } } });

describe('호실 등록 동시성', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  test('정원 2에서 같은 임대인이 3건 동시 등록 → 성공 2, LANDLORD_BUILDING_CAPACITY_EXCEEDED 1', async () => {
    const user = await fixture.createUser();
    const complex = await fixture.createComplex();
    await createLandlordBuilding(user, { complexId: complex.id, name: '정원 테스트', capacity: 2, memo: null });

    const results = await Promise.allSettled(
      ['1001', '1002', '1003'].map((unitNo) => createPropertyWithOwnership(user, unitInput(complex.id, unitNo))),
    );

    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'LANDLORD_BUILDING_CAPACITY_EXCEEDED');
    assert.equal(await activeCount(user.id, complex.id), 2);
  });

  test('정원 수정과 등록이 동시에 → 정원 < 등록 수가 되는 일 없음', async () => {
    for (let round = 0; round < 5; round += 1) {
      const user = await fixture.createUser();
      const complex = await fixture.createComplex();
      const building = await createLandlordBuilding(user, { complexId: complex.id, name: '수정 테스트', capacity: 5, memo: null });
      await createPropertyWithOwnership(user, unitInput(complex.id, '101'));

      // 등록 수 1인 상태에서 정원을 1로 줄이는 요청과 두 번째 호실 등록을 동시에
      const [patch, register] = await Promise.allSettled([
        updateLandlordBuilding(user, building.id, { capacity: 1 }),
        createPropertyWithOwnership(user, unitInput(complex.id, '102')),
      ]);

      const saved = await prisma.landlordBuilding.findUnique({ where: { id: building.id } });
      const count = await activeCount(user.id, complex.id);
      assert.ok(count <= saved.capacity, `round ${round}: count ${count} > capacity ${saved.capacity}`);
      // 둘 중 정확히 하나만 성공한다(먼저 잠금을 잡은 쪽)
      assert.equal([patch, register].filter((result) => result.status === 'fulfilled').length, 1, `round ${round}`);
      const failure = [patch, register].find((result) => result.status === 'rejected').reason.code;
      assert.ok(
        ['LANDLORD_BUILDING_CAPACITY_BELOW_UNITS', 'LANDLORD_BUILDING_CAPACITY_EXCEEDED'].includes(failure),
        failure,
      );
    }
  });

  test('같은 사용자가 같은 호실을 동시에 2건 → 하나는 OWNERSHIP_ALREADY_EXISTS', async () => {
    const user = await fixture.createUser();
    const complex = await fixture.createComplex();

    const results = await Promise.allSettled([
      createPropertyWithOwnership(user, unitInput(complex.id, '1203')),
      createPropertyWithOwnership(user, unitInput(complex.id, '1203')),
    ]);

    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'OWNERSHIP_ALREADY_EXISTS');
    assert.equal(rejected[0].reason.httpStatus, 409);
    assert.equal(await activeCount(user.id, complex.id), 1);
    // 건물 설정은 하나만 자동으로 생긴다
    assert.equal(await prisma.landlordBuilding.count({ where: { userId: user.id, complexId: complex.id } }), 1);
  });

  test('다른 임대인 둘이 같은 호실을 동시에 → 호실 하나, 소유 관계 둘', async () => {
    const [first, second] = [await fixture.createUser(), await fixture.createUser()];
    const complex = await fixture.createComplex();

    const results = await Promise.all([
      createPropertyWithOwnership(first, unitInput(complex.id, '707')),
      createPropertyWithOwnership(second, unitInput(complex.id, '707')),
    ]);

    assert.equal(results[0].property.id, results[1].property.id);
    assert.equal(await prisma.propertyOwnership.count({ where: { propertyId: results[0].property.id } }), 2);
  });
});
