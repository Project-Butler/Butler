// 임차인 초대 API(docs/11 개발 계획 2-6, 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다(test/helpers/dbTest.js).
// 실제 app을 띄워 HTTP로 부른다(쿠키·라우터·한도까지 확인).
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { after, before, beforeEach, describe, test } from 'node:test';
import app from '../../../src/app.js';
import { signAccessToken } from '../../../src/domains/auth/service.js';
import { terminateContract, updateContract } from '../../../src/domains/contracts/service.js';
import { endOwnership } from '../../../src/domains/propertyOwnerships/service.js';
import { hashToken } from '../../../src/domains/tenantInvitations/rules.js';
import { acceptInvitationInTx } from '../../../src/domains/tenantInvitations/service.js';
import { getTodayKST } from '../../../src/platform/dateUtils.js';
import { prisma } from '../../../src/platform/prismaClient.js';

const TODAY = getTodayKST();
const shift = (days) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const PHONE = '01098765432';
const ENV_KEYS = ['STORAGE_DRIVER', 'STORAGE_SIGNING_SECRET', 'LOCAL_STORAGE_DIR', 'VERCEL', 'TENANT_APP_URL'];
const clearInviteLimits = () => prisma.rateLimit.deleteMany({ where: { id: { startsWith: 'invite-' } } });

describe('임차인 초대 API', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  const userIds = [];
  const contractIds = [];
  const saved = {};
  let server;
  let origin;
  let storageDir;

  before(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'butler-invite-'));
    Object.assign(process.env, {
      STORAGE_DRIVER: 'local',
      STORAGE_SIGNING_SECRET: 'invite-test-secret', // secret-guard:allow 테스트용 더미 값
      LOCAL_STORAGE_DIR: storageDir,
      TENANT_APP_URL: 'https://tenant.example.test/',
    });
    delete process.env.VERCEL;
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => clearInviteLimits());

  after(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await new Promise((resolve) => server.close(resolve));
    const documents = await prisma.document.findMany({ where: { uploaderId: { in: userIds } }, select: { id: true } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { resourceId: { in: contractIds } },
          { resourceId: { in: documents.map((document) => document.id) } },
        ],
      },
    });
    await prisma.tenantInvitation.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.document.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.upload.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.rateLimit.deleteMany({ where: { id: { contains: id } } });
    await clearInviteLimits();
    await rm(storageDir, { recursive: true, force: true });
    await fixture.cleanup();
  });

  const createUser = async (role = 'LANDLORD') => {
    const user = await fixture.createUser(role);
    userIds.push(user.id);
    return user;
  };

  let unitSeq = 0;
  // 인증된 소유 관계 + 진행 중 계약(+ 계약 서류 n개)
  const setup = async ({ documents = 0 } = {}) => {
    const landlord = await createUser();
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '105', unitNo: `${2000 + unitSeq}` } });
    const ownership = await prisma.ownership.create({
      data: {
        propertyId: property.id,
        userId: landlord.id,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationExpiresAt: new Date(Date.now() + 86400000 * 365),
      },
    });
    const contract = await prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        leaseType: 'MONTHLY',
        deposit: 50000000n,
        monthlyRent: 800000n,
        startDate: shift(-30),
        endDate: shift(700),
        tenantName: '이임차',
        tenantPhone: PHONE,
      },
    });
    contractIds.push(contract.id);
    const docs = [];
    for (let index = 0; index < documents; index += 1) docs.push(await createDocument(landlord, contract.id));
    return { landlord, property, ownership, contract, docs };
  };

  const createDocument = async (landlord, contractId, type = 'CONTRACT_DOCUMENT') => {
    const upload = await prisma.upload.create({
      data: {
        userId: landlord.id,
        type,
        fileName: '계약서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10n,
        storagePath: `dbtest/${randomUUID()}`,
        expiresAt: new Date(Date.now() + 86400000),
        completedAt: new Date(),
      },
    });
    return prisma.document.create({
      data: {
        uploadId: upload.id,
        uploaderId: landlord.id,
        type,
        resourceType: 'CONTRACT',
        resourceId: contractId,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        attachedAt: new Date(),
      },
    });
  };

  // cookies: 'a=b; c=d' 형태. 응답 set-cookie의 bt_iv 값을 돌려준다.
  const api = async (pathname, { user = null, method = 'GET', body, cookies = [] } = {}) => {
    const cookieHeader = [...(user ? [`access_token=${signAccessToken(user)}`] : []), ...cookies].join('; ');
    const response = await fetch(`${origin}/api/v1${pathname}`, {
      method,
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        'X-Requested-With': 'butler-web',
        'Content-Type': 'application/json',
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    const setCookies = response.headers.getSetCookie();
    const ivCookie = setCookies.find((cookie) => cookie.startsWith('bt_iv='));
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
      setCookies,
      ivCookie,
      iv: ivCookie ? ivCookie.split(';')[0].slice('bt_iv='.length) : null,
    };
  };

  const issue = (landlord, contractId, sharedDocumentIds) =>
    api(`/contracts/${contractId}/tenant-invitations`, { user: landlord, method: 'POST', body: sharedDocumentIds ? { sharedDocumentIds } : {} });
  const tokenOf = (inviteUrl) => inviteUrl.split('/invite/')[1];
  const verify = (token, phoneLast4, cookies = []) => api(`/tenant-invitations/${token}/verify`, { method: 'POST', body: { phoneLast4 }, cookies });
  // 발급 + 본인 확인까지
  const issueAndVerify = async (options) => {
    const context = await setup(options);
    const issued = await issue(context.landlord, context.contract.id, context.docs.map((document) => document.id));
    assert.equal(issued.status, 201);
    const token = tokenOf(issued.body.data.inviteUrl);
    const verified = await verify(token, '5432');
    assert.equal(verified.status, 200);
    return { ...context, invitationId: issued.body.data.id, token, iv: verified.iv };
  };
  const invitationRow = (id) => prisma.tenantInvitation.findUnique({ where: { id } });

  test('발급: 201, inviteUrl은 이 응답에만, DB에는 해시만', async () => {
    const { landlord, contract, docs } = await setup({ documents: 2 });
    const issued = await issue(landlord, contract.id, docs.map((document) => document.id));
    assert.equal(issued.status, 201);
    const data = issued.body.data;
    assert.match(data.inviteUrl, /^https:\/\/tenant\.example\.test\/invite\/[A-Za-z0-9_-]{32}$/);
    assert.equal(data.status, 'PENDING');
    assert.equal(data.sharedDocumentCount, 2);
    assert.equal(new Date(data.expiresAt).getTime() - new Date(data.createdAt).getTime(), 7 * 86400000);
    const row = await invitationRow(data.id);
    assert.equal(row.tokenHash, hashToken(tokenOf(data.inviteUrl)));
    assert.equal(row.createdById, landlord.id);
    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'TENANT_INVITATION_ISSUED', resourceId: contract.id } });
    assert.ok(auditRow.summary.includes(data.id));
    assert.ok(!JSON.stringify(auditRow).includes(tokenOf(data.inviteUrl)));

    const list = await api(`/contracts/${contract.id}/tenant-invitations`, { user: landlord });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].inviteUrl, null);
  });

  test('발급 거절: 11개 422, 다른 계약 문서 404, 남의 계약 404, 해지 계약 422, 수락된 계약 409', async () => {
    const { landlord, contract } = await setup();
    const eleven = Array.from({ length: 11 }, () => randomUUID());
    assert.equal((await issue(landlord, contract.id, eleven)).body.error.code, 'ATTACHMENT_LIMIT_EXCEEDED');
    const other = await setup({ documents: 1 });
    const foreignDoc = await issue(landlord, contract.id, [other.docs[0].id]);
    assert.equal(foreignDoc.status, 404);
    assert.equal(foreignDoc.body.error.code, 'DOCUMENT_NOT_FOUND');
    const deleted = await createDocument(landlord, contract.id);
    await prisma.document.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    assert.equal((await issue(landlord, contract.id, [deleted.id])).status, 404);
    assert.equal((await issue(other.landlord, contract.id)).body.error.code, 'CONTRACT_NOT_FOUND');
    const tenant = await createUser('TENANT');
    assert.equal((await issue(tenant, contract.id)).body.error.code, 'FORBIDDEN_ROLE');

    await prisma.contract.update({ where: { id: other.contract.id }, data: { terminatedOn: shift(0) } });
    const readOnly = await issue(other.landlord, other.contract.id);
    assert.equal(readOnly.status, 422);
    assert.equal(readOnly.body.error.code, 'CONTRACT_READ_ONLY');

    await prisma.contract.update({ where: { id: contract.id }, data: { tenantId: tenant.id } });
    assert.equal((await issue(landlord, contract.id)).body.error.code, 'INVITATION_ALREADY_ACCEPTED');
  });

  test('재발급: 이전 PENDING은 CANCELED, 그 확인 세션도 폐기', async () => {
    const first = await issueAndVerify();
    const second = await issue(first.landlord, first.contract.id);
    assert.equal(second.status, 201);
    const old = await invitationRow(first.invitationId);
    assert.equal(old.status, 'CANCELED');
    assert.ok(old.canceledAt);
    assert.equal(await prisma.tenantInvitationVerification.count({ where: { invitationId: first.invitationId, revokedAt: null } }), 0);
    const oldContract = await api(`/tenant-invitations/${first.token}/contract`, { cookies: [`bt_iv=${first.iv}`] });
    assert.equal(oldContract.status, 422);
    assert.equal(oldContract.body.error.code, 'INVITATION_EXPIRED');

    const list = await api(`/contracts/${first.contract.id}/tenant-invitations`, { user: first.landlord });
    assert.deepEqual(list.body.data.map((item) => item.status), ['PENDING', 'CANCELED']);
    // 기간이 지난 PENDING은 응답에서 EXPIRED
    await prisma.tenantInvitation.update({ where: { id: second.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredList = await api(`/contracts/${first.contract.id}/tenant-invitations`, { user: first.landlord });
    assert.equal(expiredList.body.data[0].status, 'EXPIRED');
    assert.equal((await api(`/tenant-invitations/${tokenOf(second.body.data.inviteUrl)}`)).body.error.code, 'INVITATION_EXPIRED');
  });

  test('공개 요약: 금액·임차인 정보 없음, 없는 토큰 404', async () => {
    const { landlord, contract } = await setup({ documents: 1 });
    await createDocument(landlord, contract.id);
    const issued = await issue(landlord, contract.id, []);
    const summary = await api(`/tenant-invitations/${tokenOf(issued.body.data.inviteUrl)}`);
    assert.equal(summary.status, 200);
    assert.deepEqual(Object.keys(summary.body.data).sort(), [
      'endDate',
      'expiresAt',
      'landlordName',
      'landlordVerified',
      'leaseType',
      'propertyDisplayName',
      'sharedDocumentCount',
      'startDate',
      'status',
    ]);
    assert.equal(summary.body.data.landlordVerified, true);
    assert.equal(summary.body.data.sharedDocumentCount, 0);
    const text = JSON.stringify(summary.body);
    for (const secret of [PHONE, '5432', '이임차', '50000000', '800000']) assert.ok(!text.includes(secret), secret);
    assert.equal((await api(`/tenant-invitations/${'x'.repeat(32)}`)).body.error.code, 'INVITATION_INVALID');
    assert.equal((await api('/tenant-invitations/bad')).status, 404);
  });

  test('본인 확인 성공: bt_iv 쿠키(HttpOnly·Lax·/api/v1·30분), 계약서 열람', async () => {
    const { token, iv, invitationId, contract, docs } = await issueAndVerify({ documents: 1 });
    const verification = await prisma.tenantInvitationVerification.findFirst({ where: { invitationId } });
    assert.ok(verification);
    assert.equal(verification.idHash, hashToken(iv));
    assert.ok(Math.abs(verification.expiresAt.getTime() - Date.now() - 30 * 60000) < 60000);

    const again = await verify(token, '5432', [`bt_iv=${iv}`]);
    assert.match(again.ivCookie, /HttpOnly/);
    assert.match(again.ivCookie, /SameSite=Lax/);
    assert.match(again.ivCookie, /Path=\/api\/v1/);
    assert.match(again.ivCookie, /Max-Age=1800/);
    // 같은 초대의 이전 세션은 새것으로 바뀐다
    assert.ok((await prisma.tenantInvitationVerification.findUnique({ where: { idHash: hashToken(iv) } })).revokedAt);

    const view = await api(`/tenant-invitations/${token}/contract`, { cookies: [`bt_iv=${again.iv}`] });
    assert.equal(view.status, 200);
    assert.equal(view.body.data.deposit, 50000000);
    assert.equal(view.body.data.monthlyRent, 800000);
    assert.equal(view.body.data.leaseType, 'MONTHLY');
    assert.equal(view.body.data.landlordName, 'DB 테스트');
    assert.deepEqual(view.body.data.sharedDocuments, [{ id: docs[0].id, fileName: '계약서.pdf', mimeType: 'application/pdf', sizeBytes: 10 }]);
    assert.ok(!JSON.stringify(view.body).includes(PHONE));
    assert.equal(contract.tenantPhone, PHONE);
  });

  test('본인 확인 실패: 422 뒤 DB 실패 수가 실제로 늘고, 3회 뒤 대기 중 시도는 세지 않는다', async () => {
    const { landlord, contract } = await setup();
    const issued = await issue(landlord, contract.id);
    const token = tokenOf(issued.body.data.inviteUrl);
    const id = issued.body.data.id;

    const first = await verify(token, '0000');
    assert.equal(first.status, 422);
    assert.equal(first.body.error.code, 'INVITATION_VERIFY_FAILED');
    assert.equal(first.iv, null);
    assert.equal((await invitationRow(id)).verifyFailCount, 1);

    await verify(token, '0000');
    const third = await verify(token, '0000');
    assert.equal(third.body.error.code, 'INVITATION_VERIFY_FAILED');
    assert.ok((await invitationRow(id)).nextVerifyAt);

    // 맞는 번호여도 대기 중이면 비교하지 않는다
    const waiting = await verify(token, '5432');
    assert.equal(waiting.status, 429);
    assert.equal(waiting.body.error.code, 'INVITATION_VERIFY_RATE_LIMITED');
    assert.equal(waiting.body.error.details[0].retryAfterSeconds > 0, true);
    assert.equal(waiting.headers.get('retry-after'), String(waiting.body.error.details[0].retryAfterSeconds));
    assert.equal((await invitationRow(id)).verifyFailCount, 3);
    assert.ok(!JSON.stringify(waiting.body).includes('3회'));

    // 형식 오류는 400, 세지 않는다
    assert.equal((await verify(token, '12')).status, 400);

    // 대기가 끝나면 다시 시도할 수 있고, 성공하면 카운터 초기화
    await prisma.tenantInvitation.update({ where: { id }, data: { nextVerifyAt: new Date(Date.now() - 1000) } });
    const ok = await verify(token, '5432');
    assert.equal(ok.status, 200);
    const row = await invitationRow(id);
    assert.equal(row.verifyFailCount, 0);
    assert.equal(row.nextVerifyAt, null);
  });

  test('하루 한도: 15번째 실패에서 429 DAILY_LIMIT, 임대인 알림 한 번, 그 뒤는 비교하지 않는다', async () => {
    const { landlord, contract, property } = await setup();
    const issued = await issue(landlord, contract.id);
    const token = tokenOf(issued.body.data.inviteUrl);
    const id = issued.body.data.id;
    await prisma.tenantInvitation.update({
      where: { id },
      data: { verifyFailCount: 14, verifyFailWindowStart: new Date(Date.now() - 3600_000), nextVerifyAt: null },
    });

    const limited = await verify(token, '0000');
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'INVITATION_VERIFY_DAILY_LIMIT');
    const row = await invitationRow(id);
    assert.equal(row.verifyFailCount, 15);
    assert.ok(row.landlordAlertedAt);
    const notifications = await prisma.notification.findMany({ where: { userId: landlord.id, type: 'TENANT_INVITATION_VERIFY_FAILED' } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].link, `/properties/${property.id}`);

    const blocked = await verify(token, '5432');
    assert.equal(blocked.body.error.code, 'INVITATION_VERIFY_DAILY_LIMIT');
    assert.equal((await invitationRow(id)).verifyFailCount, 15);
    assert.equal(await prisma.notification.count({ where: { userId: landlord.id, type: 'TENANT_INVITATION_VERIFY_FAILED' } }), 1);
  });

  test('병렬 본인 확인 20건: 비교는 3번만(나머지는 대기), 카운터가 정확하다', async () => {
    const { landlord, contract } = await setup();
    const issued = await issue(landlord, contract.id);
    const token = tokenOf(issued.body.data.inviteUrl);
    const results = await Promise.all(Array.from({ length: 20 }, () => verify(token, '0000')));
    const codes = results.map((result) => result.body.error.code);
    const failed = codes.filter((code) => code === 'INVITATION_VERIFY_FAILED').length;
    assert.equal(failed, 3);
    for (const code of codes) assert.ok(['INVITATION_VERIFY_FAILED', 'INVITATION_VERIFY_RATE_LIMITED', 'RATE_LIMITED'].includes(code), code);
    // IP 한도(기존 rateLimiter)는 동시 요청에서 DB 경합 시 통과시키는(fail-open) 방식이라 여기서는 개수를 보지 않는다.
    // 대입 방지의 핵심(비교 3번·카운터 정확)은 초대 행 잠금으로 보장되고, IP 한도는 아래 순차 테스트가 확인한다.
    assert.equal((await invitationRow(issued.body.data.id)).verifyFailCount, 3);
  });

  test('IP 한도: 분당 10회를 넘으면 429 RATE_LIMITED', async () => {
    const { landlord, contract } = await setup();
    const token = tokenOf((await issue(landlord, contract.id)).body.data.inviteUrl);
    for (let index = 0; index < 10; index += 1) await verify(token, '12');
    assert.equal((await verify(token, '12')).body.error.code, 'RATE_LIMITED');
  });

  test('확인 세션 없음·다른 초대 세션·폐기·번호 변경 뒤에는 V-02·V-03·A-09 거절(403)', async () => {
    const a = await issueAndVerify({ documents: 1 });
    const b = await issueAndVerify();
    const tenant = await createUser('TENANT');
    const docPath = `/tenant-invitations/${a.token}/documents/${a.docs[0].id}/download-url`;
    const tries = (cookies) => [
      api(`/tenant-invitations/${a.token}/contract`, { cookies }),
      api(docPath, { method: 'POST', cookies }),
      api(`/tenant-invitations/${a.token}/accept`, { method: 'POST', user: tenant, cookies }),
    ];
    const expectRequired = async (cookies) => {
      for (const result of await Promise.all(tries(cookies))) {
        assert.equal(result.status, 403);
        assert.equal(result.body.error.code, 'INVITATION_VERIFY_REQUIRED');
      }
    };
    await expectRequired([]);
    await expectRequired([`bt_iv=${b.iv}`]);
    await expectRequired(['bt_iv=forged-value']);

    const revoked = await verify(a.token, '5432');
    await prisma.tenantInvitationVerification.updateMany({ where: { idHash: hashToken(revoked.iv) }, data: { revokedAt: new Date() } });
    await expectRequired([`bt_iv=${revoked.iv}`]);

    const expired = await verify(a.token, '5432');
    await prisma.tenantInvitationVerification.updateMany({ where: { idHash: hashToken(expired.iv) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expectRequired([`bt_iv=${expired.iv}`]);

    // 번호 변경(PATCH 경로) → 그 계약 초대의 세션 폐기
    const beforeChange = await verify(a.token, '5432');
    await updateContract(a.landlord, a.contract.id, { tenantPhone: '01011112222' });
    assert.ok((await prisma.tenantInvitationVerification.findUnique({ where: { idHash: hashToken(beforeChange.iv) } })).revokedAt);
    await expectRequired([`bt_iv=${beforeChange.iv}`]);
    assert.equal((await verify(a.token, '5432')).body.error.code, 'INVITATION_VERIFY_FAILED');
    assert.equal((await verify(a.token, '2222')).status, 200);
    assert.equal(tenant.role, 'TENANT');
  });

  test('V-03: 공유한 문서만 5분 주소, 감사 actor 없음·invitationId 기록', async () => {
    const { landlord, contract, token, iv, invitationId, docs } = await issueAndVerify({ documents: 1 });
    const notShared = await createDocument(landlord, contract.id);
    const cookies = [`bt_iv=${iv}`];
    const issued = await api(`/tenant-invitations/${token}/documents/${docs[0].id}/download-url`, { method: 'POST', cookies });
    assert.equal(issued.status, 200);
    assert.ok(issued.body.data.url);
    assert.ok(Math.abs(new Date(issued.body.data.expiresAt).getTime() - Date.now() - 5 * 60000) < 60000);
    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_DOWNLOAD_URL_ISSUED', resourceId: docs[0].id } });
    assert.equal(auditRow.actorId, null);
    assert.equal(auditRow.actorType, 'SYSTEM');
    assert.ok(auditRow.summary.includes(invitationId));
    assert.ok(!auditRow.summary.includes(token));

    for (const documentId of [notShared.id, randomUUID(), 'not-uuid']) {
      const result = await api(`/tenant-invitations/${token}/documents/${documentId}/download-url`, { method: 'POST', cookies });
      assert.equal(result.status, 404);
      assert.equal(result.body.error.code, 'DOCUMENT_NOT_FOUND');
    }
    await prisma.document.update({ where: { id: docs[0].id }, data: { deletedAt: new Date() } });
    assert.equal((await api(`/tenant-invitations/${token}/documents/${docs[0].id}/download-url`, { method: 'POST', cookies })).status, 404);
  });

  test('수락: TENANT만, 계약 연결·ACCEPTED·알림·감사·세션 폐기·쿠키 삭제, 링크 재사용 거절', async () => {
    const { landlord, contract, property, token, iv, invitationId } = await issueAndVerify();
    const cookies = [`bt_iv=${iv}`];
    const asLandlord = await api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: landlord, cookies });
    assert.equal(asLandlord.status, 403);
    assert.equal(asLandlord.body.error.code, 'FORBIDDEN_ROLE');
    assert.equal((await api(`/tenant-invitations/${token}/accept`, { method: 'POST', cookies })).status, 401);

    const tenant = await createUser('TENANT');
    const accepted = await api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenant, cookies });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.data.id, contract.id);
    assert.equal(accepted.body.data.tenant.userId, tenant.id);
    assert.match(accepted.ivCookie, /^bt_iv=;/);

    assert.equal((await prisma.contract.findUnique({ where: { id: contract.id } })).tenantId, tenant.id);
    const row = await invitationRow(invitationId);
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.acceptedById, tenant.id);
    assert.ok(row.acceptedAt);
    assert.equal(await prisma.tenantInvitationVerification.count({ where: { invitationId, revokedAt: null } }), 0);
    const notification = await prisma.notification.findFirst({ where: { userId: landlord.id, type: 'TENANT_INVITATION_ACCEPTED' } });
    assert.equal(notification.link, `/properties/${property.id}`);
    assert.equal(notification.resourceId, contract.id);
    const auditRow = await prisma.auditLog.findFirst({ where: { action: 'TENANT_INVITATION_ACCEPTED', resourceId: contract.id } });
    assert.equal(auditRow.actorId, tenant.id);
    assert.ok(!JSON.stringify(auditRow).includes(token));
    assert.ok(!JSON.stringify(auditRow).includes(PHONE));

    // 수락된 링크는 다시 열리지 않는다
    assert.equal((await api(`/tenant-invitations/${token}`)).body.error.code, 'INVITATION_ALREADY_ACCEPTED');
    assert.equal((await verify(token, '5432')).body.error.code, 'INVITATION_ALREADY_ACCEPTED');
    const reuse = await api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenant, cookies });
    assert.equal(reuse.status, 409);
    assert.equal(reuse.body.error.code, 'INVITATION_ALREADY_ACCEPTED');
  });

  test('동시 수락 2건 → 하나만 성공(409)', async () => {
    const { token, iv, contract } = await issueAndVerify();
    const second = await verify(token, '5432');
    const [tenantA, tenantB] = [await createUser('TENANT'), await createUser('TENANT')];
    const results = await Promise.all([
      api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenantA, cookies: [`bt_iv=${iv}`] }),
      api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenantB, cookies: [`bt_iv=${second.iv}`] }),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.equal(statuses[0], 200);
    assert.ok([403, 409].includes(statuses[1]), String(statuses[1]));
    const winner = results.find((result) => result.status === 200);
    assert.equal((await prisma.contract.findUnique({ where: { id: contract.id } })).tenantId, winner.body.data.tenant.userId);
  });

  test('다른 임차인이 이미 연결된 계약은 409 CONTRACT_TENANT_ALREADY_LINKED', async () => {
    const { token, iv, contract } = await issueAndVerify();
    const [linked, tenant] = [await createUser('TENANT'), await createUser('TENANT')];
    await prisma.contract.update({ where: { id: contract.id }, data: { tenantId: linked.id } });
    const result = await api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenant, cookies: [`bt_iv=${iv}`] });
    assert.equal(result.body.error.code, 'CONTRACT_TENANT_ALREADY_LINKED');
  });

  test('수락과 해지가 겹치면 줄을 선다: 둘 다 성공하거나, 해지 뒤 수락이 422', async () => {
    const { landlord, token, iv, contract, invitationId } = await issueAndVerify();
    const tenant = await createUser('TENANT');
    const [acceptResult, terminateResult] = await Promise.allSettled([
      api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenant, cookies: [`bt_iv=${iv}`] }),
      terminateContract(landlord, contract.id, { terminatedOn: TODAY, reason: null }),
    ]);
    assert.equal(terminateResult.status, 'fulfilled');
    const row = await invitationRow(invitationId);
    const saved = await prisma.contract.findUnique({ where: { id: contract.id } });
    assert.ok(saved.terminatedOn);
    if (acceptResult.value.status === 200) {
      assert.equal(row.status, 'ACCEPTED');
      assert.equal(saved.tenantId, tenant.id);
    } else {
      assert.equal(acceptResult.value.body.error.code, 'INVITATION_EXPIRED');
      assert.equal(row.status, 'CANCELED');
      assert.equal(saved.tenantId, null);
    }
  });

  test('해지·소유 종료 → PENDING 초대 CANCELED, 확인 세션 폐기', async () => {
    const a = await issueAndVerify();
    await terminateContract(a.landlord, a.contract.id, { terminatedOn: TODAY, reason: null });
    assert.equal((await invitationRow(a.invitationId)).status, 'CANCELED');
    assert.equal(await prisma.tenantInvitationVerification.count({ where: { invitationId: a.invitationId, revokedAt: null } }), 0);
    assert.equal((await verify(a.token, '5432')).body.error.code, 'INVITATION_EXPIRED');

    const b = await issueAndVerify();
    await endOwnership(b.landlord, b.ownership.id, { reason: null, endReason: 'SOLD' });
    assert.equal((await invitationRow(b.invitationId)).status, 'CANCELED');
    assert.equal(await prisma.tenantInvitationVerification.count({ where: { invitationId: b.invitationId, revokedAt: null } }), 0);
    assert.equal((await api(`/tenant-invitations/${b.token}`)).body.error.code, 'INVITATION_EXPIRED');
  });

  test('acceptInvitationInTx: 호출한 트랜잭션이 롤백되면 연결도 남지 않는다(가입+수락 재사용)', async () => {
    const { invitationId, iv, contract } = await issueAndVerify();
    const tenant = await createUser('TENANT');
    const req = { cookies: { bt_iv: iv } };
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        const row = await acceptInvitationInTx(tx, { invitationId, userId: tenant.id, req });
        assert.equal(row.tenantId, tenant.id);
        throw new Error('rollback');
      }),
      /rollback/,
    );
    assert.equal((await prisma.contract.findUnique({ where: { id: contract.id } })).tenantId, null);
    assert.equal((await invitationRow(invitationId)).status, 'PENDING');
    await assert.rejects(
      prisma.$transaction((tx) => acceptInvitationInTx(tx, { invitationId, userId: tenant.id, req: { cookies: {} } })),
      (error) => error.code === 'INVITATION_VERIFY_REQUIRED',
    );
  });

  test('로그에 토큰 원문이 남지 않는다', async () => {
    const { landlord, contract } = await setup();
    const lines = [];
    const originals = { info: console.info, warn: console.warn, error: console.error, log: console.log };
    for (const level of Object.keys(originals)) console[level] = (...args) => lines.push(args.map(String).join(' '));
    let token;
    try {
      token = tokenOf((await issue(landlord, contract.id)).body.data.inviteUrl);
      await verify(token, '0000');
      const ok = await verify(token, '5432');
      const tenant = await createUser('TENANT');
      await api(`/tenant-invitations/${token}/accept`, { method: 'POST', user: tenant, cookies: [`bt_iv=${ok.iv}`] });
    } finally {
      Object.assign(console, originals);
    }
    assert.ok(lines.some((line) => /\[invite\] verify fail invitationId=\S+ count=1/.test(line)));
    assert.ok(lines.some((line) => line.includes('[invite] accepted')));
    assert.ok(lines.every((line) => !line.includes(token) && !line.includes(hashToken(token))));
  });
});
