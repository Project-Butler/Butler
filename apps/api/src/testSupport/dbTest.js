// DB가 필요한 테스트(*.db.test.js) 공통 준비. RUN_DB_TESTS=1이고 DATABASE_URL 호스트가
// localhost/127.0.0.1일 때만 돈다(그 밖에는 skip) — 원격 DB(Supabase)에 테스트 행을 쓰지 않게.
// 테스트 파일에서 prismaClient보다 먼저 import해야 .env가 먼저 읽힌다.
import { randomUUID } from 'node:crypto';
import '../loadEnv.js';
import { prisma } from '../platform/prismaClient.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

const databaseHost = () => {
  try {
    return new URL(process.env.DATABASE_URL).hostname;
  } catch {
    return null;
  }
};

export const DB_TESTS_ENABLED = process.env.RUN_DB_TESTS === '1' && LOCAL_HOSTS.includes(databaseHost());

// node:test의 { skip } 옵션 값
export const dbTestSkip = DB_TESTS_ENABLED ? false : 'RUN_DB_TESTS=1과 로컬 DATABASE_URL이 필요합니다';

// 테스트 전용 데이터 묶음. cleanup()이 만든 행을 FK 역순으로 지운다.
export const createDbFixture = () => {
  const userIds = [];
  const complexIds = [];
  const sourceKeys = [];

  const createUser = async (role = 'LANDLORD') => {
    const id = randomUUID();
    await prisma.user.create({
      data: { id, email: `dbtest-${id}@butler.test`, passwordHash: 'not-used', name: 'DB 테스트', role },
    });
    userIds.push(id);
    return { id, role };
  };

  // regions에 있는 법정동(서울 노원구 중계동)으로 단지를 만든다. 키는 테스트마다 새로.
  const createComplex = async (extra = {}) => {
    const complex = await prisma.complex.create({
      data: { sourceKey: `DBTEST:${randomUUID()}`, name: 'DB 테스트 단지', regionId: '1135010600', ...extra },
    });
    complexIds.push(complex.id);
    return complex;
  };

  const trackSourceKey = (sourceKey) => sourceKeys.push(sourceKey);

  const cleanup = async () => {
    const createdComplexes = await prisma.complex.findMany({
      where: { OR: [{ id: { in: complexIds } }, { sourceKey: { in: sourceKeys } }] },
      select: { id: true },
    });
    const allComplexIds = createdComplexes.map((complex) => complex.id);
    const properties = await prisma.property.findMany({ where: { complexId: { in: allComplexIds } }, select: { id: true } });
    const propertyIds = properties.map((property) => property.id);

    await prisma.activity.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ownership.deleteMany({ where: { propertyId: { in: propertyIds } } });
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prisma.myBuilding.deleteMany({ where: { complexId: { in: allComplexIds } } });
    await prisma.complex.deleteMany({ where: { id: { in: allComplexIds } } });
    await prisma.addressCache.deleteMany({ where: { sourceKey: { in: sourceKeys } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  };

  return { createUser, createComplex, trackSourceKey, cleanup };
};
