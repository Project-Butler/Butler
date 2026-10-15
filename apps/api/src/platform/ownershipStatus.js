// PropertyOwnership.verificationStatus의 EXPIRED는 DB에 저장하지 않는다 — 저장값은
// VERIFIED로 두고, verificationExpiresAt이 지나면 조회 시점에 계산해서 EXPIRED로
// 내려준다(api-contract.md 3장 "소유 관계 상태 규칙").
//
// 주의: verifiedAt/verificationExpiresAt은 "...At" 시각 필드라서(날짜가 아니라)
// contractStatus.js처럼 KST 날짜 문자열로 바꾸지 않고, 타임스탬프 그대로 비교한다.
export const computeOwnershipVerificationStatus = (ownership, now = new Date()) => {
  if (ownership.verificationStatus !== 'VERIFIED') return ownership.verificationStatus;
  if (!ownership.verificationExpiresAt) return 'VERIFIED';

  return now.getTime() > ownership.verificationExpiresAt.getTime() ? 'EXPIRED' : 'VERIFIED';
};
