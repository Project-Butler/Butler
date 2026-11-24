// 수리 요청 분류·상태 라벨과 목록 탭(계약 5장). 임대인·임차인 화면이 같이 쓴다. 칩 색(tone)은 각 화면이 정한다.
// 분류 라벨은 서버 apps/api/src/platform/ticketRules.js의 TICKET_CATEGORY_LABELS와 같은 값이다.

export const TICKET_CATEGORY_LABELS = { REPAIR: '수리', INSPECTION: '점검', OTHER: '기타' };

export const TICKET_CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

// 상태 라벨. 접수(OPEN)만 역할마다 다르다 — 임대인은 처리할 일이라 '확인 필요', 임차인은 보낸 요청이라 '접수됨'.
const STATUS_LABELS = {
  OPEN: { LANDLORD: '확인 필요', TENANT: '접수됨' },
  IN_PROGRESS: '처리 중',
  DONE: '완료',
  CANCELED: '취소',
};

// role: 'LANDLORD' | 'TENANT'. 모르는 상태는 그대로 돌려준다.
export const getTicketStatusLabel = (status, role) => {
  const label = STATUS_LABELS[status];
  if (!label) return status;
  return typeof label === 'string' ? label : label[role] ?? label.LANDLORD;
};

export const getTicketCategoryLabel = (category) => TICKET_CATEGORY_LABELS[category] ?? category;

// 목록 탭: 진행 중(접수·처리 중) / 완료(완료·취소). status 는 GET /tickets 의 status 필터(쉼표 구분) 그대로다.
export const TICKET_TABS = [
  { key: 'active', label: '진행 중', status: 'OPEN,IN_PROGRESS' },
  { key: 'closed', label: '완료', status: 'DONE,CANCELED' },
];
