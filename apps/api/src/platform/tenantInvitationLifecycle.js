// 임차인 초대 무효화(트랜잭션 안). 계약 해지·소유 종료·임차인 번호 수정·재발급·수락이 함께 쓴다
// (docs/11 개발 계획 2-2 "폐기", 2-3 "해지·소유 종료와 초대"). 조회 때도 '쓸 수 있는 초대' 계산으로 다시 막는다(이중 안전).

// 그 초대들의 확인 세션을 모두 폐기한다.
export const revokeInvitationVerificationsInTx = async (tx, invitationIds, now = new Date()) => {
  if (invitationIds.length === 0) return 0;
  const { count } = await tx.tenantInvitationVerification.updateMany({
    where: { invitationId: { in: invitationIds }, revokedAt: null },
    data: { revokedAt: now },
  });
  return count;
};

// contractWhere: Prisma Contract 조건(예: { id } 또는 { ownershipId }). 그 계약들의 PENDING 초대를 CANCELED로 바꾸고
// 모든 초대(수락된 것 포함)의 확인 세션을 폐기한다. 취소한 초대 id 목록을 돌려준다.
export const cancelContractInvitationsInTx = async (tx, contractWhere, now = new Date()) => {
  const invitations = await tx.tenantInvitation.findMany({
    where: { contract: contractWhere },
    select: { id: true, status: true },
  });
  const pendingIds = invitations.filter((invitation) => invitation.status === 'PENDING').map((invitation) => invitation.id);
  if (pendingIds.length > 0) {
    await tx.tenantInvitation.updateMany({
      where: { id: { in: pendingIds }, status: 'PENDING' },
      data: { status: 'CANCELED', canceledAt: now },
    });
  }
  await revokeInvitationVerificationsInTx(tx, invitations.map((invitation) => invitation.id), now);
  return pendingIds;
};

// 임차인 번호가 바뀌면 그 계약 초대의 확인 세션만 폐기한다(초대는 그대로 — 새 번호로 다시 확인하면 된다).
export const revokeContractVerificationsInTx = async (tx, contractId, now = new Date()) => {
  const invitations = await tx.tenantInvitation.findMany({ where: { contractId }, select: { id: true } });
  return revokeInvitationVerificationsInTx(tx, invitations.map((invitation) => invitation.id), now);
};
