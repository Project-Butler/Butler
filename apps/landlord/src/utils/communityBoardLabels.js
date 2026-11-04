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
