// 게시판 분류(칩 문구)와 신고 사유(스키마 CommunityReportReason 주석 문구).
export const POST_CATEGORIES = [
  { value: 'FREE', label: '자유' },
  { value: 'MARKET', label: '시세·거래' },
  { value: 'MAINTENANCE', label: '수선·관리' },
  { value: 'POLICY', label: '정책·세금' },
];

export const REPORT_REASONS = [
  { value: 'SPAM', label: '도배·스팸' },
  { value: 'ABUSE', label: '욕설·비방' },
  { value: 'ADVERTISEMENT', label: '광고·홍보' },
  { value: 'PRIVACY', label: '개인정보 노출' },
  { value: 'OTHER', label: '기타' },
];

export const getCategoryLabel = (value) => POST_CATEGORIES.find((item) => item.value === value)?.label ?? value;

// 쓰기 자격이 없을 때 버튼 · 입력칸 옆의 이유 한 줄. writeBlockedReason: 'UNVERIFIED' | 'EXPIRED'
const BLOCKED_MESSAGES = {
  post: { UNVERIFIED: '글을 쓰려면 권리자 인증이 필요합니다', EXPIRED: '인증이 만료되어 글을 쓸 수 없습니다' },
  poll: { UNVERIFIED: '투표를 만들려면 권리자 인증이 필요합니다', EXPIRED: '인증이 만료되어 투표를 만들 수 없습니다' },
};
export const getBlockedMessage = (writeBlockedReason, kind = 'post') =>
  BLOCKED_MESSAGES[kind][writeBlockedReason === 'EXPIRED' ? 'EXPIRED' : 'UNVERIFIED'];
