// 소유 관계 verificationStatus → Badge tone·문구 (design.md §2-3, §5 상태 칩)
// 인증 칩 앞 체크 아이콘은 Badge에 아이콘 자리가 없어 이번엔 생략한다(디자인 후속).
const VERIFICATION_BADGE = {
  UNVERIFIED: { tone: 'pending', label: '미인증' },
  VERIFIED: { tone: 'verified', label: '인증 완료' },
  EXPIRED: { tone: 'warning', label: '인증 만료' },
  REVOKED: { tone: 'rejected', label: '인증 취소' },
};

export const getVerificationBadge = (verificationStatus) =>
  VERIFICATION_BADGE[verificationStatus] ?? VERIFICATION_BADGE.UNVERIFIED;
