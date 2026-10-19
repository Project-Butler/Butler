import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachAliases, chooseOwnerComplexId, findKeyOwners } from './complexAliases.js';

const OLD = new Date('2026-10-01T00:00:00Z');
const NEW = new Date('2026-10-10T00:00:00Z');

test('걸친 단지가 없으면 null', () => {
  assert.equal(chooseOwnerComplexId([]), null);
});

test('여러 단지에 걸치면 KAPT 별칭을 가진 단지를 고른다', () => {
  const owners = [
    { sourceKey: 'PNU:1171010200100170000', complexId: 'pnu-complex', complexCreatedAt: OLD },
    { sourceKey: 'KAPT:A13824006', complexId: 'kapt-complex', complexCreatedAt: NEW },
  ];
  assert.equal(chooseOwnerComplexId(owners), 'kapt-complex');
});

test('KAPT 별칭이 둘이면 먼저 만든 단지, KAPT가 없으면 먼저 만든 단지', () => {
  assert.equal(
    chooseOwnerComplexId([
      { sourceKey: 'KAPT:B', complexId: 'b', complexCreatedAt: NEW },
      { sourceKey: 'KAPT:A', complexId: 'a', complexCreatedAt: OLD },
    ]),
    'a',
  );
  assert.equal(
    chooseOwnerComplexId([
      { sourceKey: 'PNU:2', complexId: 'two', complexCreatedAt: NEW },
      { sourceKey: 'PNU:1', complexId: 'one', complexCreatedAt: OLD },
    ]),
    'one',
  );
});

// 가짜 db: aliases(Map sourceKey → complexId), legacy complexes [{ id, sourceKey, createdAt }]
const createFakeDb = ({ aliases = {}, complexes = [] }) => {
  const aliasMap = new Map(Object.entries(aliases));
  const createdAtById = new Map(complexes.map((complex) => [complex.id, complex.createdAt]));
  return {
    aliasMap,
    complexSourceAlias: {
      findMany: async ({ where }) =>
        where.sourceKey.in
          .filter((key) => aliasMap.has(key))
          .map((key) => ({
            sourceKey: key,
            complexId: aliasMap.get(key),
            complex: { createdAt: createdAtById.get(aliasMap.get(key)) ?? OLD },
          })),
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        let count = 0;
        for (const row of data) {
          if (aliasMap.has(row.sourceKey)) continue;
          aliasMap.set(row.sourceKey, row.complexId);
          count += 1;
        }
        return { count };
      },
    },
    complex: {
      findMany: async ({ where }) => complexes.filter((complex) => where.sourceKey.in.includes(complex.sourceKey)),
    },
  };
};

test('별칭 행이 없는 옛 단지의 source_key도 주인으로 본다', async () => {
  const db = createFakeDb({ complexes: [{ id: 'c1', sourceKey: 'KAPT:A1', createdAt: OLD }] });
  const owners = await findKeyOwners(db, ['KAPT:A1', 'PNU:x']);
  assert.deepEqual(owners, [{ sourceKey: 'KAPT:A1', complexId: 'c1', complexCreatedAt: OLD }]);
});

test('attachAliases: 비어 있는 키만 붙이고 다른 단지의 키는 옮기지 않는다', async () => {
  const db = createFakeDb({ aliases: { 'KAPT:A1': 'c1', 'PNU:other': 'c2' } });
  const result = await attachAliases(db, 'c1', ['KAPT:A1', 'PNU:new', 'PNU:other']);

  assert.equal(result.attached, 1);
  assert.deepEqual(result.conflicts, [{ sourceKey: 'PNU:other', complexId: 'c2' }]);
  assert.equal(db.aliasMap.get('PNU:new'), 'c1');
  assert.equal(db.aliasMap.get('PNU:other'), 'c2');
});

test('attachAliases: 옛 단지의 source_key에 별칭 행을 만든다', async () => {
  const db = createFakeDb({ complexes: [{ id: 'c1', sourceKey: 'KAPT:A1', createdAt: OLD }] });
  const result = await attachAliases(db, 'c1', ['KAPT:A1']);
  assert.equal(result.attached, 1);
  assert.equal(db.aliasMap.get('KAPT:A1'), 'c1');
});
