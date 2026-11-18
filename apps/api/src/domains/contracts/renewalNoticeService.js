// 갱신 거절 통지 기록(묵시적 갱신 차단, #157). 경로는 /contracts/:contractId/renewal-notices.
// 임대인 개인 기록이라 그 계약의 소유자·이전 소유자만 본다(임차인·운영자·남은 404). 쓰기는 활성 소유자만.
// 구간·도달 시점 판정은 platform/renewalNotice.js가 계산한다(저장하지 않는다).
import { audit } from '../../platform/audit.js';
import { AppError } from '../../platform/AppError.js';
import { computeContractStatus } from '../../platform/contractStatus.js';
import { getNow, getTodayKST } from '../../platform/dateUtils.js';
import {
  attachDocumentsInTx,
  findAttachedDocuments,
  RENEWAL_NOTICE_RESOURCE,
  softDeleteDocumentsInTx,
  toAttachmentResponse,
  withAttachments,
} from '../../platform/documentAttachments.js';
import { prisma } from '../../platform/prismaClient.js';
import { computeRenewalNoticeWindow, toRenewalNoticeResponse } from '../../platform/renewalNotice.js';
import { removeStoredObjects } from '../documents/storage/index.js';
import { lockContractForOwner } from './service.js';

// 통지 하나에 붙일 수 있는 증빙 수
export const MAX_RENEWAL_NOTICE_ATTACHMENTS = 5;

const toDbDate = (dateString) => (dateString ? new Date(`${dateString}T00:00:00Z`) : null);

const throwContractNotFound = () => {
  throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
};

export const throwRenewalNoticeNotFound = () => {
  throw new AppError('RENEWAL_NOTICE_NOT_FOUND', 404, '통지 기록을 찾을 수 없습니다.');
};

const throwReadOnly = () => {
  throw new AppError('CONTRACT_READ_ONLY', 422, '끝난 계약이거나 소유가 끝난 호실이라 통지 기록을 바꿀 수 없습니다.');
};

const respond = (notice, endDate) =>
  toRenewalNoticeResponse(notice, computeRenewalNoticeWindow(endDate), (notice.attachments ?? []).map(toAttachmentResponse));

// 읽기: 그 계약의 소유자(활성·이전)만. 아니면 null.
const findViewableContract = (user, contractId) =>
  prisma.contract.findFirst({ where: { id: contractId, ownership: { userId: user.id } }, select: { id: true, endDate: true } });

// 쓰기 공통: 계약의 소유 관계를 잠그고, 소유가 끝났거나 계약이 끝났으면 422.
const lockWritableContract = async (tx, user, contractId) => {
  const { contract, ownership } = await lockContractForOwner(tx, user, contractId);
  const status = computeContractStatus(contract, getTodayKST());
  if (ownership.endedAt || status === 'EXPIRED' || status === 'TERMINATED') throwReadOnly();
  return contract;
};

// GET /contracts/:contractId/renewal-notices — 최신순, 페이지 없음(계약 하나에 몇 건뿐).
export const findRenewalNotices = async (user, contractId) => {
  const contract = await findViewableContract(user, contractId);
  if (!contract) throwContractNotFound();
  const rows = await prisma.renewalNotice.findMany({
    where: { contractId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const notices = await withAttachments(prisma, RENEWAL_NOTICE_RESOURCE, rows);
  return notices.map((notice) => respond(notice, contract.endDate));
};

// POST /contracts/:contractId/renewal-notices — input은 컨트롤러가 검증한 값.
// 증빙은 먼저 미연결 문서로 올리고(POST /documents) 그 id를 attachmentDocumentIds로 넘긴다.
export const createRenewalNotice = async (user, contractId, { attachmentDocumentIds = [], ...input }, req) =>
  prisma.$transaction(async (tx) => {
    const contract = await lockWritableContract(tx, user, contractId);
    const notice = await tx.renewalNotice.create({
      data: {
        contractId: contract.id,
        authorId: user.id,
        kind: input.kind,
        method: input.method,
        sentOn: toDbDate(input.sentOn),
        deliveredOn: toDbDate(input.deliveredOn),
        memo: input.memo ?? null,
      },
    });
    await attachDocumentsInTx(tx, user, {
      resourceType: RENEWAL_NOTICE_RESOURCE,
      resourceId: notice.id,
      documentIds: attachmentDocumentIds,
      now: getNow(),
    });
    await audit.record({
      actor: user,
      action: 'RENEWAL_NOTICE_RECORDED',
      resourceType: 'CONTRACT',
      resourceId: contract.id,
      summary: '갱신 거절 통지 기록',
      after: { kind: input.kind, method: input.method, sentOn: input.sentOn, deliveredOn: input.deliveredOn ?? null },
      req,
      client: tx,
    });
    const [withDocuments] = await withAttachments(tx, RENEWAL_NOTICE_RESOURCE, [notice]);
    return respond(withDocuments, contract.endDate);
  });

// DELETE /contracts/:contractId/renewal-notices/:noticeId — 붙은 증빙도 숨기고 파일을 지운다.
export const deleteRenewalNotice = async (user, contractId, noticeId, req) => {
  const removedPaths = await prisma.$transaction(async (tx) => {
    const contract = await lockWritableContract(tx, user, contractId);
    const notice = await tx.renewalNotice.findFirst({ where: { id: noticeId, contractId: contract.id } });
    if (!notice) throwRenewalNoticeNotFound();
    const documents = await findAttachedDocuments(tx, RENEWAL_NOTICE_RESOURCE, notice.id);
    const paths = await softDeleteDocumentsInTx(tx, documents, getNow());
    await tx.renewalNotice.delete({ where: { id: notice.id } });
    await audit.record({
      actor: user,
      action: 'RENEWAL_NOTICE_DELETED',
      resourceType: 'CONTRACT',
      resourceId: contract.id,
      summary: '갱신 거절 통지 기록 삭제',
      req,
      client: tx,
    });
    return paths;
  });
  await removeStoredObjects(removedPaths);
};

// 문서 권한(documents/resourcePolicies.js의 RENEWAL_NOTICE). 통지가 붙은 계약의 소유자만 본다.
export const canViewRenewalNotice = async (user, noticeId) =>
  Boolean(await prisma.renewalNotice.findFirst({ where: { id: noticeId, contract: { ownership: { userId: user.id } } }, select: { id: true } }));

// 증빙을 나중에 붙이거나 지울 때의 잠금. 남의 통지는 404, 끝난 계약은 422.
export const lockWritableRenewalNotice = async (tx, user, noticeId) => {
  const notice = await tx.renewalNotice.findUnique({ where: { id: noticeId }, select: { id: true, contractId: true } });
  if (!notice) throwRenewalNoticeNotFound();
  try {
    await lockWritableContract(tx, user, notice.contractId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONTRACT_NOT_FOUND') throwRenewalNoticeNotFound();
    throw error;
  }
  return notice;
};
