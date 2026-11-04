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

// 커뮤니티 권한 계산에 필요한 소유 관계 칸(/auth/me와 requireRegionMember가 같이 쓴다).
export const OWNERSHIP_REGION_SELECT = {
  verificationStatus: true,
  verificationExpiresAt: true,
  property: { select: { complex: { select: { regionId: true } } } },
};

// 활성 소유 관계 행 중 인증이 유효한 것의 법정동 코드(중복 제거).
export const pickVerifiedLegalDongCodes = (ownerships, now = new Date()) => [
  ...new Set(
    ownerships
      .filter((ownership) => computeOwnershipVerificationStatus(ownership, now) === 'VERIFIED')
      .map((ownership) => ownership.property.complex.regionId),
  ),
];
