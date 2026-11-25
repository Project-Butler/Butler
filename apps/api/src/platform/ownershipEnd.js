// 소유 관계 종료(트랜잭션 안). 사용자 종료·운영자 종료·인증 시 자동 종료가 함께 쓴다.
import { AppError } from './AppError.js';
import { getNow, getTodayKST } from './dateUtils.js';
import { lockHistoryLogDocumentsInTx, MANAGEMENT_LOG_RESOURCE, softDeleteDocumentsInTx } from './documentAttachments.js';
import { cancelContractInvitationsInTx } from './tenantInvitationLifecycle.js';

const throwOwnershipEnded = () => {
  throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
};

// 소유 관계의 기록을 지운다(where는 기록 조건 — 소유 관계 id 포함). 붙은 문서는 숨기고 지울 파일 경로를 돌려준다.
// 한 번도 인증하지 않은 소유 관계가 끝날 때 전부(H-37), [목록에서 지우기] 때 나만 보기 기록(H-41)에 쓴다.
// 기록을 가리키던 티켓은 DB가 log_id를 비운다(ON DELETE SET NULL). 숨김 행은 DB가 함께 지운다(ON DELETE CASCADE).
// 한 번도 인증하지 않은 소유 관계인가(H-37 기록 삭제 조건). 인증받은 임대인의 기록이 잘못 지워지지 않도록 세 칸이 모두
// "인증 전"일 때만 true다: 처음 인증 시각 없음 · 인증 시각 없음 · 상태 UNVERIFIED(만료는 VERIFIED로 저장, 철회는 REVOKED).
// 칸을 읽지 않아 undefined면 인증 전으로 보지 않는다(null만 본다).
export const isNeverVerifiedOwnership = (ownership) =>
  ownership.firstVerifiedAt === null && ownership.verifiedAt === null && ownership.verificationStatus === 'UNVERIFIED';

export const removeLogsInTx = async (tx, where, now) => {
  const logs = await tx.propertyLog.findMany({ where, select: { id: true } });
  if (logs.length === 0) return [];
  const logIds = logs.map((log) => log.id);
  const documents = await tx.document.findMany({
    where: { resourceType: MANAGEMENT_LOG_RESOURCE, resourceId: { in: logIds }, deletedAt: null },
  });
  const removedPaths = await softDeleteDocumentsInTx(tx, documents, now);
  await tx.propertyLog.deleteMany({ where: { id: { in: logIds } } });
  return removedPaths;
};

// checkActiveContracts: 본인 종료(SELF_ENDED)만 true — 매도(SOLD)·자동 종료·운영자 종료는 계약이 있어도 진행한다(api-contract.md 3장).
// 없는 소유 관계·본인 확인은 호출하는 쪽이 먼저 한다.
// 돌려주는 값: { ownership: 종료된 행(property·complex 포함), removedPaths: 지울 파일 경로 }.
// 파일은 트랜잭션 밖에서 지워야 하므로 호출하는 쪽이 커밋 뒤 removeStoredObjects(removedPaths)를 부른다.
// ownership.firstVerifiedAt·verifiedAt·verificationStatus가 필요하다(lockOwnershipRow·lockActiveOwnershipRows가 읽는다).
export const endOwnershipInTx = async (tx, ownership, { endReason, note, checkActiveContracts }) => {
  if (ownership.endedAt) throwOwnershipEnded();

  if (checkActiveContracts) {
    // 시작 전·진행 중 계약 = 해지되지 않았고 종료일이 오늘(KST) 이후.
    // contractStatus.js의 UPCOMING·ACTIVE·EXPIRING_SOON과 같은 조건이다 — 규칙이 바뀌면 함께 수정할 것.
    // endDate는 @db.Date(UTC 자정 Date)라 오늘(KST)도 UTC 자정 Date로 만들어 비교한다.
    const activeContract = await tx.contract.findFirst({
      where: {
        ownershipId: ownership.id,
        terminatedOn: null,
        endDate: { gte: new Date(`${getTodayKST()}T00:00:00Z`) },
      },
      select: { id: true },
    });
    if (activeContract) {
      throw new AppError(
        'OWNERSHIP_HAS_ACTIVE_CONTRACTS',
        422,
        '시작 전이거나 진행 중인 계약이 있어 소유를 종료할 수 없습니다. 계약을 먼저 해지해 주세요.',
      );
    }
  }

  // 동시에 종료 요청이 와도 한 번만 종료되도록 endedAt null 조건을 건다.
  const now = getNow();
  const { count } = await tx.ownership.updateMany({
    where: { id: ownership.id, endedAt: null },
    data: { endedAt: now, endReason, endNote: note },
  });
  if (count === 0) throwOwnershipEnded();
  // 인증 전 기록은 지우고(H-37), 인증한 적 있으면 호실 이력이 다음 소유자에게 넘어가므로 거기 붙은 문서를 잠근다(삭제 불가).
  const neverVerified = isNeverVerifiedOwnership(ownership);
  const removedPaths = neverVerified ? await removeLogsInTx(tx, { ownershipId: ownership.id }, now) : [];
  if (!neverVerified) await lockHistoryLogDocumentsInTx(tx, ownership.id);
  // 끝난 소유 관계의 계약은 읽기 전용이라 PENDING 초대를 CANCELED, 확인 세션은 폐기한다(docs/11 2-3).
  await cancelContractInvitationsInTx(tx, { ownershipId: ownership.id });

  const ended = await tx.ownership.findUnique({ where: { id: ownership.id }, include: { property: { include: { complex: true } } } });
  return { ownership: ended, removedPaths };
};
