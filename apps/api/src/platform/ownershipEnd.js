// 소유 관계 종료(트랜잭션 안). 사용자 종료·운영자 종료·인증 시 자동 종료가 함께 쓴다.
import { AppError } from './AppError.js';
import { getNow, getTodayKST } from './dateUtils.js';
import { lockHistoryLogDocumentsInTx } from './documentAttachments.js';
import { cancelContractInvitationsInTx } from './tenantInvitationLifecycle.js';

const throwOwnershipEnded = () => {
  throw new AppError('OWNERSHIP_ENDED', 422, '이미 종료된 소유 관계입니다.');
};

// checkActiveContracts: 본인 종료(SELF_ENDED)만 true — 매도(SOLD)·자동 종료·운영자 종료는 계약이 있어도 진행한다(api-contract.md 3장).
// 없는 소유 관계·본인 확인은 호출하는 쪽이 먼저 한다. 종료된 행(property·complex 포함)을 돌려준다.
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
  const { count } = await tx.ownership.updateMany({
    where: { id: ownership.id, endedAt: null },
    data: { endedAt: getNow(), endReason, endNote: note },
  });
  if (count === 0) throwOwnershipEnded();
  // 호실 이력이 다음 소유자에게 넘어가므로 거기 붙은 문서를 잠근다(삭제 불가).
  await lockHistoryLogDocumentsInTx(tx, ownership.id);
  // 끝난 소유 관계의 계약은 읽기 전용이라 PENDING 초대를 CANCELED, 확인 세션은 폐기한다(docs/11 2-3).
  await cancelContractInvitationsInTx(tx, { ownershipId: ownership.id });

  return tx.ownership.findUnique({ where: { id: ownership.id }, include: { property: { include: { complex: true } } } });
};
