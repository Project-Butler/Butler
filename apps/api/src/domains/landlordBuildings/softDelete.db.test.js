// 건물 설정 삭제 = 숨김(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../testSupport/dbTest.js';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { prisma } from '../../platform/prismaClient.js';
import { endOwnership } from '../propertyOwnerships/service.js';
import { createPropertyWithOwnership } from '../properties/service.js';
import {
  createLandlordBuilding,
  deleteLandlordBuilding,
  findLandlordBuildingForUser,
  findMyLandlordBuildings,
  updateLandlordBuilding,
} from './service.js';

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

const LIST = { page: 1, size: 20 };

describe('건물 설정 숨김 삭제', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  test('삭제하면 행은 남고(deletedAt) 목록·조회·수정에서는 사라진다. includeDeleted면 이름이 보인다', async () => {
    const user = await fixture.createUser();
    const complex = await fixture.createComplex();
    const building = await createLandlordBuilding(user, { complexId: complex.id, name: '내가 붙인 이름', capacity: null, memo: null });
    const { ownership } = await createPropertyWithOwnership(user, unitInput(complex.id, '1001'));
    await endOwnership(user, ownership.id, { reason: null });

    await deleteLandlordBuilding(user, building.id);

    const row = await prisma.myBuilding.findUnique({ where: { id: building.id } });
    assert.ok(row.deletedAt);
    assert.equal((await findMyLandlordBuildings(user, LIST)).items.length, 0);
    assert.equal(await findLandlordBuildingForUser(user, building.id), null);
    await assert.rejects(updateLandlordBuilding(user, building.id, { name: 'x' }), { code: 'LANDLORD_BUILDING_NOT_FOUND' });

    const all = await findMyLandlordBuildings(user, { ...LIST, includeDeleted: true });
    assert.equal(all.items.length, 1);
    assert.equal(all.items[0].name, '내가 붙인 이름');
    assert.ok(all.items[0].deletedAt);
  });

  test('같은 주소로 다시 등록하면 숨긴 행을 되살린다(새 이름·설명으로, 행은 하나)', async () => {
    const user = await fixture.createUser();
    const complex = await fixture.createComplex();
    const first = await createLandlordBuilding(user, { complexId: complex.id, name: '처음 이름', capacity: null, memo: '메모' });
    await deleteLandlordBuilding(user, first.id);

    const again = await createLandlordBuilding(user, { complexId: complex.id, name: '새 이름', capacity: null, memo: null });
    assert.equal(again.id, first.id);
    assert.equal(again.name, '새 이름');
    assert.equal(again.memo, null);
    assert.equal(again.deletedAt, null);
    assert.equal(await prisma.myBuilding.count({ where: { userId: user.id, complexId: complex.id } }), 1);

    await assert.rejects(
      createLandlordBuilding(user, { complexId: complex.id, name: '또', capacity: null, memo: null }),
      { code: 'LANDLORD_BUILDING_ALREADY_EXISTS' },
    );
  });

  test('숨긴 건물의 주소로 호실을 등록하면 이름 그대로 되살아난다', async () => {
    const user = await fixture.createUser();
    const complex = await fixture.createComplex();
    const building = await createLandlordBuilding(user, { complexId: complex.id, name: '되살릴 이름', capacity: null, memo: null });
    await deleteLandlordBuilding(user, building.id);

    await createPropertyWithOwnership(user, unitInput(complex.id, '1002'));

    const row = await prisma.myBuilding.findUnique({ where: { id: building.id } });
    assert.equal(row.deletedAt, null);
    assert.equal(row.name, '되살릴 이름');
  });
});
