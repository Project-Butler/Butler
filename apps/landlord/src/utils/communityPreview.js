// 인증 전 미리보기 상태 — 지금 건물의 법정동 기준.
// 쓰기 · 본문 자격은 법정동 단위라(서버 requireRegionMember), 같은 동의 다른 건물이 인증돼 있으면 미리보기가 아니다.
// buildings: GET /community/my-buildings 응답(건물마다 verificationStatus · verifyPropertyId)
// → { reason: null | 'UNVERIFIED' | 'EXPIRED', verifyPropertyId: string | null }
//   reason 은 서버 writeBlockedReason 과 같은 규칙(그 동에 만료가 있으면 EXPIRED, 아니면 UNVERIFIED)
//   verifyPropertyId 는 권리자 인증 화면으로 갈 호실 — 지금 건물 것 먼저, 없으면 같은 동의 다른 건물 것
export const getRegionPreview = (buildings, current) => {
  if (!current) return { reason: null, verifyPropertyId: null };
  const sameDong = buildings.filter((building) => building.legalDongCode === current.legalDongCode);
  if (sameDong.some((building) => building.verificationStatus === 'VERIFIED')) {
    return { reason: null, verifyPropertyId: null };
  }
  const reason = sameDong.some((building) => building.verificationStatus === 'EXPIRED') ? 'EXPIRED' : 'UNVERIFIED';
  const verifyPropertyId =
    current.verifyPropertyId ?? sameDong.find((building) => building.verifyPropertyId)?.verifyPropertyId ?? null;
  return { reason, verifyPropertyId };
};
