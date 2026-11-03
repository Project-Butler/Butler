// 관리자 단지 직접 등록(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { prisma } from '../../../src/platform/prismaClient.js';
import { createComplex } from '../../../src/domains/admin/service.js';

const INPUT = {
  name: 'DB 테스트 관리자 단지',
  jibunAddress: '서울특별시 노원구 중계동 1',
  roadAddress: null,
  legalDongCode: '1135010600',
};

describe('관리자 단지 등록', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const auditLogIds = [];
  after(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: auditLogIds } } });
    await fixture.cleanup();
  });

  const createTracked = async (actor, input) => {
    const complex = await createComplex(actor, input);
    fixture.trackSourceKey(complex.sourceKey);
    const logs = await prisma.auditLog.findMany({ where: { resourceId: complex.id }, select: { id: true, action: true } });
    auditLogIds.push(...logs.map((log) => log.id));
    return { complex, logs };
  };

  test('만들면 createdByAdmin이고 감사 로그 1건, sourceKey를 비우면 ADMIN: 키', async () => {
    const admin = await fixture.createUser('ADMIN');
    const { complex, logs } = await createTracked(admin, { ...INPUT, sourceKey: null });

    assert.match(complex.sourceKey, /^ADMIN:/);
    assert.equal(complex.region.legalDongCode, INPUT.legalDongCode);
    assert.equal(complex.buildingInfo, null);
    const saved = await prisma.complex.findUnique({ where: { id: complex.id }, select: { createdByAdmin: true } });
    assert.equal(saved.createdByAdmin, true);
    assert.deepEqual(logs.map((log) => log.action), ['COMPLEX_CREATED_BY_ADMIN']);
  });

  test('같은 sourceKey는 409, 감사 로그도 남지 않는다', async () => {
    const admin = await fixture.createUser('ADMIN');
    const sourceKey = `DBTEST:${randomUUID()}`;
    await createTracked(admin, { ...INPUT, sourceKey });

    await assert.rejects(createComplex(admin, { ...INPUT, sourceKey }), { code: 'COMPLEX_ALREADY_EXISTS', httpStatus: 409 });
    const count = await prisma.auditLog.count({ where: { action: 'COMPLEX_CREATED_BY_ADMIN', actorId: admin.id } });
    assert.equal(count, 1);
  });

  test('없는 법정동은 404 REGION_NOT_FOUND', async () => {
    const admin = await fixture.createUser('ADMIN');
    await assert.rejects(createComplex(admin, { ...INPUT, legalDongCode: '9999999999', sourceKey: null }), {
      code: 'REGION_NOT_FOUND',
      httpStatus: 404,
    });
  });
});
