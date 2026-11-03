// 계약 API 서비스(실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(testSupport/dbTest.js).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { lockOwnershipRow } from '../../../src/platform/ownershipLock.js';
import { prisma } from '../../../src/platform/prismaClient.js';
import { findLandlordSetup } from '../../../src/domains/dashboard/service.js';
import { findPropertyForUser } from '../../../src/domains/properties/service.js';
import { endOwnership } from '../../../src/domains/propertyOwnerships/service.js';
import {
  createContract,
  findContractForUser,
  findContracts,
  terminateContract,
  updateContract,
  withPeriodConflictAs409,
} from '../../../src/domains/contracts/service.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const contractInput = (ownershipId, overrides = {}) => ({
  ownershipId,
  leaseType: 'MONTHLY',
  deposit: 50000000n,
  monthlyRent: 800000n,
  startDate: shift(-30),
  endDate: shift(700),
  tenantName: '이임차',
  tenantPhone: '01098765432',
  previousContractId: null,
  memo: '관리비 별도',
  ...overrides,
});

const LIST_DEFAULTS = { propertyId: null, ownershipId: null, statuses: [], sort: { field: 'endDate', direction: 'asc' }, page: 1, size: 20 };

const rejectsWith = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
};

describe('계약 서비스', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  // 감사 로그 정리용: 이 파일 테스트가 만든 사용자를 기억해 두었다가, 그 사용자 소유 계약의 감사 로그만 지운다.
  const testUserIds = [];
  const createUserOriginal = fixture.createUser;
  fixture.createUser = async (role) => {
    const user = await createUserOriginal(role);
    testUserIds.push(user.id);
    return user;
  };
  after(async () => {
    const contracts = await prisma.contract.findMany({ where: { ownership: { userId: { in: testUserIds } } }, select: { id: true } });
    await prisma.auditLog.deleteMany({
      where: { resourceType: 'CONTRACT', OR: [{ resourceId: { in: contracts.map((contract) => contract.id) } }, { actorId: { in: testUserIds } }] },
    });
    await fixture.cleanup();
  });

  let unitSeq = 0;
  const createOwnedUnit = async (user) => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '101', unitNo: `${1000 + unitSeq}` } });
    const verified = { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verificationExpiresAt: new Date(Date.now() + 86400000 * 365) };
    const ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: user.id, ...verified } });
    return { complex, property, ownership };
  };

  test('잠금 함수는 camelCase 칸으로 돌려준다', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const row = await prisma.$transaction((tx) => lockOwnershipRow(tx, ownership.id));
    assert.deepEqual(Object.keys(row).sort(), ['endedAt', 'id', 'propertyId', 'userId', 'verificationExpiresAt', 'verificationStatus']);
    assert.equal(row.userId, user.id);
    assert.equal(row.verificationStatus, 'VERIFIED');
  });

  test('미인증·만료·취소된 호실은 계약을 등록할 수 없다', async () => {
    const user = await fixture.createUser();
    const statuses = [
      { verificationStatus: 'UNVERIFIED', verifiedAt: null, verificationExpiresAt: null },
      { verificationExpiresAt: new Date(Date.now() - 86400000) },
      { verificationStatus: 'REVOKED' },
    ];
    for (const data of statuses) {
      const { ownership } = await createOwnedUnit(user);
      await prisma.ownership.update({ where: { id: ownership.id }, data });
      await rejectsWith(createContract(user, contractInput(ownership.id)), 'OWNERSHIP_VERIFICATION_REQUIRED');
    }
  });

  test('등록 → 진행 중, 호실 임대중, 초기 세팅 계약 단계 완료, 활동 1행', async () => {
    const user = await fixture.createUser();
    const { property, ownership } = await createOwnedUnit(user);
    const contract = await createContract(user, contractInput(ownership.id));

    assert.equal(contract.status, 'ACTIVE');
    assert.equal(contract.deposit, 50000000);
    assert.equal(contract.landlordVerified, true);
    assert.equal(contract.isReadOnly, false);
    assert.equal(contract.tenant.invitationStatus, null);
    const view = await findPropertyForUser(user, property.id);
    assert.equal(view.status, 'LEASED');
    const setup = await findLandlordSetup(user);
    assert.deepEqual(setup.steps[1], { key: 'CONTRACT', done: true, count: 1 });
    assert.equal(await prisma.activity.count({ where: { userId: user.id, type: 'CONTRACT_CREATED' } }), 1);
  });

  test('검사 순서와 에러 코드', async () => {
    const user = await fixture.createUser();
    const other = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);

    await rejectsWith(createContract(other, contractInput(ownership.id)), 'OWNERSHIP_NOT_FOUND');
    await rejectsWith(createContract(user, contractInput(ownership.id, { monthlyRent: 0n })), 'CONTRACT_INVALID_AMOUNT');
    await rejectsWith(
      createContract(user, contractInput(ownership.id, { leaseType: 'JEONSE', deposit: 0n, monthlyRent: 0n })),
      'CONTRACT_INVALID_AMOUNT',
    );
    await rejectsWith(createContract(user, contractInput(ownership.id, { endDate: shift(-30) })), 'CONTRACT_INVALID_PERIOD');
    await rejectsWith(
      createContract(user, contractInput(ownership.id, { previousContractId: '00000000-0000-4000-8000-000000000000' })),
      'VALIDATION_ERROR',
    );
    // 실패한 요청은 활동을 남기지 않는다
    assert.equal(await prisma.activity.count({ where: { userId: user.id } }), 0);
  });

  test('소유가 끝났고 금액도 틀리면 금액 오류가 먼저(R-03 → R-06)', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    await prisma.ownership.update({ where: { id: ownership.id }, data: { endedAt: new Date(), endReason: 'SELF_ENDED' } });
    await rejectsWith(createContract(user, contractInput(ownership.id, { monthlyRent: 0n })), 'CONTRACT_INVALID_AMOUNT');
    await rejectsWith(createContract(user, contractInput(ownership.id)), 'OWNERSHIP_ENDED');
  });

  test('소유가 끝난 진행 중 계약은 끝남 조회에 들어오고 activeOwnership에서는 빠진다', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const contract = await createContract(user, contractInput(ownership.id));
    await prisma.ownership.update({ where: { id: ownership.id }, data: { endedAt: new Date(), endReason: 'SOLD' } });
    const ended = { ...LIST_DEFAULTS, statuses: ['EXPIRED', 'TERMINATED'] };

    assert.equal((await findContracts(user, ended)).items.length, 0);
    const { items } = await findContracts(user, { ...ended, includeEndedOwnership: true });
    assert.deepEqual(items.map(({ id }) => id), [contract.id]);
    assert.equal(items[0].endReason, 'SOLD');
    const current = await findContracts(user, { ...LIST_DEFAULTS, statuses: [items[0].status], activeOwnership: true });
    assert.equal(current.items.length, 0);
  });

  test('기간 겹침 409, 해지된 계약과는 겹쳐도 된다', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const first = await createContract(user, contractInput(ownership.id));
    await rejectsWith(createContract(user, contractInput(ownership.id, { startDate: shift(100), endDate: shift(900) })), 'CONTRACT_PERIOD_OVERLAP');

    await terminateContract(user, first.id, { terminatedOn: TODAY, reason: null });
    const second = await createContract(user, contractInput(ownership.id, { startDate: shift(100), endDate: shift(900) }));
    assert.equal(second.status, 'UPCOMING');
  });

  test('서비스 검사를 거치지 않아도 DB 제약이 겹침을 막고 409로 바뀐다, 해지된 계약과는 겹쳐도 된다', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const first = await createContract(user, contractInput(ownership.id));
    const insertDirectly = () =>
      prisma.contract.create({
        data: {
          ownershipId: ownership.id,
          leaseType: 'MONTHLY',
          deposit: 50000000n,
          monthlyRent: 800000n,
          startDate: new Date(`${shift(700)}T00:00:00Z`), // 앞 계약 종료일과 같은 날(양끝 포함)
          endDate: new Date(`${shift(900)}T00:00:00Z`),
          tenantName: '이임차',
          tenantPhone: '01098765432',
        },
      });

    await rejectsWith(withPeriodConflictAs409(insertDirectly), 'CONTRACT_PERIOD_OVERLAP');
    // 다른 오류는 그대로 올린다
    const unrelated = new Error('다른 오류');
    await assert.rejects(withPeriodConflictAs409(() => Promise.reject(unrelated)), (error) => error === unrelated);

    await terminateContract(user, first.id, { terminatedOn: TODAY, reason: null });
    await withPeriodConflictAs409(insertDirectly);
  });

  test('같은 기간 동시 등록 → 하나만 성공', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const results = await Promise.allSettled([
      createContract(user, contractInput(ownership.id)),
      createContract(user, contractInput(ownership.id)),
      createContract(user, contractInput(ownership.id)),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    for (const result of results.filter((item) => item.status === 'rejected')) {
      assert.equal(result.reason.code, 'CONTRACT_PERIOD_OVERLAP');
    }
  });

  test('계약 등록과 소유 종료를 동시에 → 종료된 소유 관계에 진행 중 계약이 붙지 않는다', async () => {
    for (let round = 0; round < 5; round += 1) {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const [created, ended] = await Promise.allSettled([
        createContract(user, contractInput(ownership.id)),
        endOwnership(user, ownership.id, { reason: null }),
      ]);
      const saved = await prisma.ownership.findUnique({ where: { id: ownership.id } });
      const liveContracts = await prisma.contract.count({ where: { ownershipId: ownership.id, terminatedOn: null } });
      assert.ok(!(saved.endedAt && liveContracts > 0), `round ${round}: 종료 + 진행 중 계약`);
      assert.equal([created, ended].filter((result) => result.status === 'fulfilled').length, 1, `round ${round}`);
      const failure = [created, ended].find((result) => result.status === 'rejected').reason.code;
      assert.ok(['OWNERSHIP_ENDED', 'OWNERSHIP_HAS_ACTIVE_CONTRACTS'].includes(failure), failure);
    }
  });

  test('보는 사람에 따라: 남은 404, 임차인은 메모 없이 읽기 전용, 운영자도 읽기 전용, 이전 소유자도 읽기 전용', async () => {
    const user = await fixture.createUser();
    const stranger = await fixture.createUser();
    const tenant = await fixture.createUser('TENANT');
    const admin = await fixture.createUser('ADMIN');
    const { ownership } = await createOwnedUnit(user);
    const contract = await createContract(user, contractInput(ownership.id));
    await prisma.contract.update({ where: { id: contract.id }, data: { tenantId: tenant.id } });

    assert.equal(await findContractForUser(stranger, contract.id), null);
    await rejectsWith(updateContract(stranger, contract.id, { memo: 'x' }), 'CONTRACT_NOT_FOUND');
    await rejectsWith(terminateContract(stranger, contract.id, { terminatedOn: TODAY, reason: null }), 'CONTRACT_NOT_FOUND');

    const asTenant = await findContractForUser(tenant, contract.id);
    assert.equal(asTenant.memo, null);
    assert.equal(asTenant.isReadOnly, true);
    const asAdmin = await findContractForUser(admin, contract.id);
    assert.equal(asAdmin.memo, null);
    assert.equal(asAdmin.isReadOnly, true);

    const { items } = await findContracts(tenant, LIST_DEFAULTS);
    assert.deepEqual(items.map((item) => item.id), [contract.id]);
    assert.equal((await findContracts(stranger, LIST_DEFAULTS)).items.length, 0);

    await terminateContract(user, contract.id, { terminatedOn: TODAY, reason: null });
    await endOwnership(user, ownership.id, { reason: null });
    const asFormer = await findContractForUser(user, contract.id);
    assert.equal(asFormer.isReadOnly, true);
  });

  test('진행 중 계약은 연락처·메모만, 시작 전 계약은 전부 수정', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const active = await createContract(user, contractInput(ownership.id));

    await assert.rejects(updateContract(user, active.id, { deposit: 60000000n }), (error) => {
      assert.equal(error.code, 'CONTRACT_READ_ONLY');
      assert.deepEqual(error.details, [{ field: 'deposit', reason: 'LOCKED_WHILE_ACTIVE' }]);
      return true;
    });
    const patched = await updateContract(user, active.id, { tenantPhone: '01011112222', memo: null });
    assert.equal(patched.tenant.phone, '01011112222');
    assert.equal(patched.memo, null);

    const upcoming = await createContract(user, contractInput(ownership.id, { startDate: shift(701), endDate: shift(1400) }));
    const changed = await updateContract(user, upcoming.id, { deposit: 60000000n, startDate: shift(710) });
    assert.equal(changed.deposit, 60000000);
    assert.equal(changed.startDate, shift(710));
    // 합친 값으로 다시 검사: 시작 전 계약을 기존 진행 계약과 겹치게 옮기면 409
    await rejectsWith(updateContract(user, upcoming.id, { startDate: shift(600) }), 'CONTRACT_PERIOD_OVERLAP');
  });

  test('해지일 규칙과 해지 뒤 상태', async () => {
    const user = await fixture.createUser();
    const { property, ownership } = await createOwnedUnit(user);
    const upcoming = await createContract(user, contractInput(ownership.id, { startDate: shift(10), endDate: shift(700) }));
    assert.equal((await findPropertyForUser(user, property.id)).status, 'CONTRACT_PENDING');

    await rejectsWith(terminateContract(user, upcoming.id, { terminatedOn: shift(1), reason: null }), 'CONTRACT_INVALID_PERIOD');
    // 시작 전 계약을 오늘로 해지 = 취소
    const terminated = await terminateContract(user, upcoming.id, { terminatedOn: TODAY, reason: '잘못 입력' });
    assert.equal(terminated.status, 'TERMINATED');
    assert.equal(terminated.isReadOnly, true);
    assert.equal((await findPropertyForUser(user, property.id)).status, 'VACANT');
    await rejectsWith(terminateContract(user, upcoming.id, { terminatedOn: TODAY, reason: null }), 'CONTRACT_NOT_TERMINABLE');
    await rejectsWith(updateContract(user, upcoming.id, { memo: 'x' }), 'CONTRACT_READ_ONLY');
  });

  test('갱신 계약은 이전 계약이 끝난 뒤 시작해야 한다', async () => {
    const user = await fixture.createUser();
    const { ownership } = await createOwnedUnit(user);
    const previous = await createContract(user, contractInput(ownership.id));
    await rejectsWith(
      createContract(user, contractInput(ownership.id, { startDate: shift(699), endDate: shift(1400), previousContractId: previous.id })),
      'VALIDATION_ERROR',
    );
    const renewal = await createContract(
      user,
      contractInput(ownership.id, { startDate: shift(701), endDate: shift(1430), previousContractId: previous.id, monthlyRent: 850000n }),
    );
    assert.equal(renewal.previousContractId, previous.id);
    assert.equal(renewal.status, 'UPCOMING');
  });

  test('목록 상태 필터·정렬·페이지', async () => {
    const user = await fixture.createUser();
    const first = await createOwnedUnit(user);
    const second = await createOwnedUnit(user);
    const soon = await createContract(user, contractInput(first.ownership.id, { endDate: shift(60) }));
    const later = await createContract(user, contractInput(second.ownership.id));

    const expiring = await findContracts(user, { ...LIST_DEFAULTS, statuses: ['EXPIRING_SOON'] });
    assert.deepEqual(expiring.items.map((item) => item.id), [soon.id]);
    const live = await findContracts(user, { ...LIST_DEFAULTS, statuses: ['ACTIVE', 'EXPIRING_SOON'] });
    assert.deepEqual(live.items.map((item) => item.id), [soon.id, later.id]);
    const paged = await findContracts(user, { ...LIST_DEFAULTS, size: 1 });
    assert.deepEqual(paged.meta, { page: 1, size: 1, total: 2, hasNext: true });
    const byProperty = await findContracts(user, { ...LIST_DEFAULTS, propertyId: second.property.id });
    assert.deepEqual(byProperty.items.map((item) => item.id), [later.id]);
  });

  describe('감사 로그', () => {
    const auditRows = (resourceId, action) =>
      prisma.auditLog.findMany({ where: { resourceType: 'CONTRACT', resourceId, ...(action ? { action } : {}) } });
    const SECRETS = ['관리비 별도', '비밀메모', '01098765432', '01011112222', '이임차', '박임차', '잘못 입력'];
    const assertNoSecrets = (row) => {
      const text = JSON.stringify([row.before, row.after, row.summary]);
      for (const secret of SECRETS) assert.ok(!text.includes(secret), `감사 로그에 ${secret} 포함`);
    };

    test('등록 → CONTRACT_CREATED 1행, 허용 칸만, 개인정보·메모 없음', async () => {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const created = await createContract(user, contractInput(ownership.id, { memo: '비밀메모' }));

      const rows = await auditRows(created.id);
      assert.equal(rows.length, 1);
      const [row] = rows;
      assert.equal(row.action, 'CONTRACT_CREATED');
      assert.equal(row.actorType, 'USER');
      assert.equal(row.actorId, user.id);
      assert.equal(row.resourceId, created.id);
      assert.equal(row.summary, '계약 등록');
      assert.equal(row.before, null);
      assert.deepEqual(row.after, {
        leaseType: 'MONTHLY',
        deposit: '50000000',
        monthlyRent: '800000',
        startDate: shift(-30),
        endDate: shift(700),
        previousContractId: null,
        terminatedOn: null,
      });
      assertNoSecrets(row);
    });

    test('연락처·메모만 고친 수정 → 1행, before/after 없음, summary에 칸 이름만', async () => {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const created = await createContract(user, contractInput(ownership.id));
      await updateContract(user, created.id, { tenantPhone: '01011112222', memo: '비밀메모' });

      const rows = await auditRows(created.id, 'CONTRACT_UPDATED');
      assert.equal(rows.length, 1);
      const [row] = rows;
      assert.equal(row.actorType, 'USER');
      assert.equal(row.actorId, user.id);
      assert.equal(row.resourceId, created.id);
      assert.equal(row.summary, '계약 수정: 임차인 연락처, 메모');
      assert.equal(row.before, null);
      assert.equal(row.after, null);
      assertNoSecrets(row);
    });

    test('시작 전 계약 월세 수정 → before/after에 전후 값, summary에 월세', async () => {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const upcoming = await createContract(user, contractInput(ownership.id, { startDate: shift(10), endDate: shift(700) }));
      await updateContract(user, upcoming.id, { monthlyRent: 900000n });

      const [row] = await auditRows(upcoming.id, 'CONTRACT_UPDATED');
      assert.deepEqual(row.before, { monthlyRent: '800000' });
      assert.deepEqual(row.after, { monthlyRent: '900000' });
      assert.equal(row.summary, '계약 수정: 월세');

      await updateContract(user, upcoming.id, { endDate: shift(800), tenantName: '박임차' });
      const rows = await auditRows(upcoming.id, 'CONTRACT_UPDATED');
      const dated = rows.find((item) => item.summary === '계약 수정: 종료일, 임차인 이름');
      assert.deepEqual(dated.before, { endDate: shift(700) });
      assert.deepEqual(dated.after, { endDate: shift(800) });
      assertNoSecrets(dated);
    });

    test('해지 → CONTRACT_TERMINATED 1행, 해지 사유 없음', async () => {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const created = await createContract(user, contractInput(ownership.id));
      await terminateContract(user, created.id, { terminatedOn: TODAY, reason: '잘못 입력' });

      const rows = await auditRows(created.id, 'CONTRACT_TERMINATED');
      assert.equal(rows.length, 1);
      const [row] = rows;
      assert.equal(row.actorType, 'USER');
      assert.equal(row.actorId, user.id);
      assert.equal(row.resourceId, created.id);
      assert.equal(row.summary, '계약 해지');
      assert.deepEqual(row.before, { terminatedOn: null });
      assert.deepEqual(row.after, { terminatedOn: TODAY });
      assertNoSecrets(row);
    });

    test('req를 넘기면 requestId·ip 저장, 안 넘기면 비어 있다', async () => {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const req = { requestId: randomUUID(), ip: '203.0.113.7' };
      const withReq = await createContract(user, contractInput(ownership.id), req);
      await updateContract(user, withReq.id, { memo: 'x' }, req);
      await terminateContract(user, withReq.id, { terminatedOn: TODAY, reason: null }, req);
      const rows = await auditRows(withReq.id);
      assert.equal(rows.length, 3);
      for (const row of rows) {
        assert.equal(row.requestId, req.requestId);
        assert.equal(row.ip, req.ip);
      }

      const other = await createOwnedUnit(user);
      const withoutReq = await createContract(user, contractInput(other.ownership.id));
      const [plain] = await auditRows(withoutReq.id);
      assert.equal(plain.requestId, null);
      assert.equal(plain.ip, null);
    });

    test('실패한 요청(겹침 409, 잠긴 칸 422, 해지일 422)은 감사 로그를 남기지 않는다', async () => {
      const user = await fixture.createUser();
      const { ownership } = await createOwnedUnit(user);
      const created = await createContract(user, contractInput(ownership.id));
      const countAll = () => prisma.auditLog.count({ where: { actorId: user.id } });
      assert.equal(await countAll(), 1);

      await rejectsWith(createContract(user, contractInput(ownership.id, { startDate: shift(100), endDate: shift(900) })), 'CONTRACT_PERIOD_OVERLAP');
      await rejectsWith(updateContract(user, created.id, { deposit: 60000000n }), 'CONTRACT_READ_ONLY');
      await rejectsWith(terminateContract(user, created.id, { terminatedOn: shift(1), reason: null }), 'CONTRACT_INVALID_PERIOD');
      assert.equal(await countAll(), 1);
      assert.equal((await auditRows(created.id)).length, 1);
    });
  });
});
