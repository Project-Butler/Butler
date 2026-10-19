// resolveComplex 흐름(별칭 조회 → 외부 조회 → 같은 건물 키 → 생성)을 가짜 prisma·provider로 확인한다(DB·외부 호출 없음).
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.JUSO_API_KEY = process.env.JUSO_API_KEY ?? 'test-key';
process.env.DATA_GO_KR_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? 'test-key';

const { prisma } = await import('../../platform/prismaClient.js');
const { publicProvider } = await import('./provider/publicProvider.js');
const { resolveComplex } = await import('./service.js');

const KAPT_KEY = 'KAPT:A13824006';
const PNU_KEY = 'PNU:1171010200100170000';
const REGION = {
  legalDongCode: '1171010200',
  sidoName: '서울특별시',
  sigunguName: '송파구',
  dongName: '신천동',
  fullName: '서울특별시 송파구 신천동',
};
const EXTERNAL = {
  sourceKey: KAPT_KEY,
  name: '잠실파크리오',
  jibunAddress: '서울특별시 송파구 신천동 17',
  roadAddress: '서울특별시 송파구 올림픽로 435',
  legalDongCode: '1171010200',
  buildingInfo: null,
};

const uniqueError = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

// complexes·complex_source_aliases만 흉내 낸 메모리 DB. 유니크 충돌은 P2002, 트랜잭션은 실패하면 되돌린다.
const createFakeDb = () => {
  const db = { complexes: [], aliases: [], transactions: 0, beforeTransaction: null };
  let nextId = 1;
  const withRegion = (complex) => (complex ? { ...complex, region: REGION } : null);

  db.addComplex = (sourceKey, keys, createdAt = new Date('2026-10-01T00:00:00Z')) => {
    const complex = { ...EXTERNAL, id: `c${nextId++}`, sourceKey, createdAt };
    db.complexes.push(complex);
    keys.forEach((key) => db.aliases.push({ sourceKey: key, complexId: complex.id }));
    return complex;
  };

  const client = {
    complex: {
      findUnique: async ({ where }) =>
        withRegion(db.complexes.find((c) => (where.id ? c.id === where.id : c.sourceKey === where.sourceKey))),
      findMany: async ({ where }) =>
        db.complexes
          .filter((c) => where.sourceKey.in.includes(c.sourceKey))
          .map((c) => ({ id: c.id, sourceKey: c.sourceKey, createdAt: c.createdAt })),
      create: async ({ data }) => {
        if (db.complexes.some((c) => c.sourceKey === data.sourceKey)) throw uniqueError();
        const complex = { ...data, id: `c${nextId++}`, createdAt: new Date() };
        db.complexes.push(complex);
        return withRegion(complex);
      },
    },
    complexSourceAlias: {
      findUnique: async ({ where }) => db.aliases.find((a) => a.sourceKey === where.sourceKey) ?? null,
      findMany: async ({ where }) =>
        db.aliases
          .filter((a) => where.sourceKey.in.includes(a.sourceKey))
          .map((a) => ({
            sourceKey: a.sourceKey,
            complexId: a.complexId,
            complex: { createdAt: db.complexes.find((c) => c.id === a.complexId).createdAt },
          })),
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const row of data) {
          if (db.aliases.some((a) => a.sourceKey === row.sourceKey)) {
            if (skipDuplicates) continue;
            throw uniqueError();
          }
          db.aliases.push(row);
          count += 1;
        }
        return { count };
      },
    },
    region: { findUnique: async () => ({ legalDongCode: REGION.legalDongCode }) },
    $transaction: async (fn) => {
      db.transactions += 1;
      if (db.beforeTransaction) await db.beforeTransaction();
      const snapshot = { complexes: [...db.complexes], aliases: [...db.aliases] };
      try {
        return await fn(client);
      } catch (error) {
        db.complexes = snapshot.complexes;
        db.aliases = snapshot.aliases;
        throw error;
      }
    },
  };
  Object.assign(prisma, client);
  return db;
};

let providerCalls;
let linkedKeysFor;
beforeEach(() => {
  providerCalls = 0;
  linkedKeysFor = () => [KAPT_KEY, PNU_KEY];
  publicProvider.getComplexBySourceKey = async (sourceKey) => {
    providerCalls += 1;
    return { ...EXTERNAL, sourceKey };
  };
  publicProvider.getLinkedSourceKeys = async (sourceKey) => linkedKeysFor(sourceKey);
});

test('resolve: 별칭에 있는 키면 외부 호출 없이 그 단지', async () => {
  const db = createFakeDb();
  const existing = db.addComplex(PNU_KEY, [PNU_KEY, KAPT_KEY]);

  const result = await resolveComplex(KAPT_KEY);

  assert.equal(result.id, existing.id);
  assert.equal(providerCalls, 0);
  assert.equal(db.complexes.length, 1);
});

test('resolve: 새 단지는 같은 건물 키 전부를 한 트랜잭션으로 넣는다', async () => {
  const db = createFakeDb();

  const result = await resolveComplex(KAPT_KEY);

  assert.equal(db.transactions, 1);
  assert.equal(db.complexes.length, 1);
  assert.equal(result.sourceKey, KAPT_KEY);
  assert.deepEqual(
    db.aliases.map((a) => [a.sourceKey, a.complexId]),
    [
      [KAPT_KEY, result.id],
      [PNU_KEY, result.id],
    ],
  );
  // 다른 키로 다시 resolve해도 같은 단지
  assert.equal((await resolveComplex(PNU_KEY)).id, result.id);
  assert.equal(db.complexes.length, 1);
});

test('resolve: 동시에 만든 쪽이 이기면(P2002) 다시 시도해 그 단지를 돌려준다', async () => {
  const db = createFakeDb();
  let winner = null;
  // 우리 트랜잭션 직전에 다른 요청이 같은 건물을 PNU 키로 먼저 만든다.
  db.beforeTransaction = async () => {
    if (!winner) winner = db.addComplex(PNU_KEY, [PNU_KEY, KAPT_KEY]);
  };

  const result = await resolveComplex(KAPT_KEY);

  assert.equal(result.id, winner.id);
  assert.equal(db.complexes.length, 1);
  assert.equal(db.aliases.filter((a) => a.complexId !== winner.id).length, 0);
});

test('resolve: 이미 갈라진 두 단지가 있어도 세 번째 단지를 만들지 않는다', async () => {
  const db = createFakeDb();
  const kaptOwner = db.addComplex(KAPT_KEY, [KAPT_KEY], new Date('2026-10-05T00:00:00Z'));
  db.addComplex(PNU_KEY, [PNU_KEY], new Date('2026-10-01T00:00:00Z'));
  const otherPnu = 'PNU:1171010200100180000';
  linkedKeysFor = (sourceKey) => [sourceKey, KAPT_KEY, PNU_KEY];

  const result = await resolveComplex(otherPnu);

  assert.equal(result.id, kaptOwner.id);
  assert.equal(db.complexes.length, 2);
  assert.equal(db.transactions, 0);
  assert.equal(db.aliases.find((a) => a.sourceKey === otherPnu).complexId, kaptOwner.id);
});
