// 초대 테이블 제약(docs/11 개발 계획 2-1, 실제 로컬 Postgres). RUN_DB_TESTS=1일 때만 돈다.
// 계약당 PENDING 하나·ACCEPTED 하나(부분 유니크), 초대 삭제 시 공유 문서·확인 세션 cascade.
import { createDbFixture, dbTestSkip } from '../../helpers/dbTest.js';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { prisma } from '../../../src/platform/prismaClient.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const inDays = (days) => new Date(Date.now() + days * 86400000);

describe('초대 테이블 제약', { skip: dbTestSkip }, () => {
  const fixture = createDbFixture();
  after(() => fixture.cleanup());

  let unitSeq = 0;
  const createContract = async (landlord) => {
    const complex = await fixture.createComplex();
    unitSeq += 1;
    const property = await prisma.property.create({ data: { complexId: complex.id, buildingNo: '103', unitNo: `${4000 + unitSeq}` } });
    const ownership = await prisma.ownership.create({ data: { propertyId: property.id, userId: landlord.id } });
    return prisma.contract.create({
      data: {
        ownershipId: ownership.id,
        leaseType: 'MONTHLY',
        deposit: 10000000n,
        monthlyRent: 500000n,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2027-12-31T00:00:00Z'),
        tenantName: '김임차',
        tenantPhone: '01012345678',
      },
    });
  };
  const invite = (contract, landlord, data = {}) =>
    prisma.tenantInvitation.create({
      data: { contractId: contract.id, createdBy: landlord.id, tokenHash: sha256(randomUUID()), expiresAt: inDays(7), ...data },
    });
  const rejectsUnique = (promise) =>
    assert.rejects(promise, (error) => {
      assert.equal(error.code, 'P2002');
      return true;
    });

  test('기본값: PENDING, 실패 카운터 0', async () => {
    const landlord = await fixture.createUser();
    const contract = await createContract(landlord);
    const invitation = await invite(contract, landlord);
    assert.equal(invitation.status, 'PENDING');
    assert.equal(invitation.verifyFailCount, 0);
    assert.equal(invitation.nextVerifyAt, null);
    assert.equal(invitation.landlordAlertedAt, null);
  });

  test('계약당 PENDING 하나 — 이전 것을 CANCELED로 바꾸면 새로 만들 수 있다', async () => {
    const landlord = await fixture.createUser();
    const contract = await createContract(landlord);
    const first = await invite(contract, landlord);
    await rejectsUnique(invite(contract, landlord));
    await prisma.tenantInvitation.update({ where: { id: first.id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    await invite(contract, landlord);
    // 다른 계약은 상관없다
    await invite(await createContract(landlord), landlord);
  });

  test('계약당 ACCEPTED 하나, 같은 token_hash는 거절', async () => {
    const landlord = await fixture.createUser();
    const tenant = await fixture.createUser('TENANT');
    const contract = await createContract(landlord);
    const accepted = { status: 'ACCEPTED', acceptedAt: new Date(), acceptedBy: tenant.id };
    const first = await invite(contract, landlord, accepted);
    await rejectsUnique(invite(contract, landlord, accepted));
    await rejectsUnique(invite(await createContract(landlord), landlord, { tokenHash: first.tokenHash }));
  });

  test('초대를 지우면 공유 문서 연결·확인 세션이 함께 지워진다', async () => {
    const landlord = await fixture.createUser();
    const contract = await createContract(landlord);
    const invitation = await invite(contract, landlord);
    const upload = await prisma.upload.create({
      data: {
        userId: landlord.id,
        type: 'CONTRACT_DOCUMENT',
        fileName: '계약서.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10n,
        storagePath: `dbtest/${randomUUID()}`,
        expiresAt: inDays(1),
      },
    });
    const document = await prisma.document.create({
      data: {
        uploadId: upload.id,
        uploaderId: landlord.id,
        type: 'CONTRACT_DOCUMENT',
        resourceType: 'CONTRACT',
        resourceId: contract.id,
        storagePath: upload.storagePath,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
      },
    });
    await prisma.tenantInvitationDocument.create({ data: { invitationId: invitation.id, documentId: document.id } });
    await prisma.tenantInvitationVerification.create({
      data: { invitationId: invitation.id, idHash: sha256(randomUUID()), phoneFingerprint: sha256(`${contract.id}01012345678`), expiresAt: inDays(1) },
    });

    await prisma.tenantInvitation.delete({ where: { id: invitation.id } });
    assert.equal(await prisma.tenantInvitationDocument.count({ where: { invitationId: invitation.id } }), 0);
    assert.equal(await prisma.tenantInvitationVerification.count({ where: { invitationId: invitation.id } }), 0);

    await prisma.document.delete({ where: { id: document.id } });
    await prisma.upload.delete({ where: { id: upload.id } });
  });
});
