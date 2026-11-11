// 계약 표기 도우미(임차인 앱·공개 초대 화면이 같이 쓴다). 역할 폴더끼리 import할 수 없어 임대인 utils 와 따로 둔다.
// 숫자·날짜는 쓰는 쪽에서 font-num tabular-nums 로 감싼다.
const LEASE_TYPE_LABEL = { MONTHLY: '월세', JEONSE: '전세' };

export const getLeaseTypeLabel = (leaseType) => LEASE_TYPE_LABEL[leaseType] ?? '';

const formatNumber = (value) => Number(value).toLocaleString('ko-KR');

// 50000000 → '5,000만 원', 520000000 → '5억 2,000만 원', 만 원 단위가 아니면 '1,234,567원'
export const formatManwon = (value) => {
  if (value == null) return null;
  if (value === 0 || value % 10000 !== 0) return `${formatNumber(value)}원`;
  const parts = [
    [Math.floor(value / 1000000000000), '조'],
    [Math.floor((value % 1000000000000) / 100000000), '억'],
    [(value % 100000000) / 10000, '만'],
  ];
  return `${parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${formatNumber(amount)}${unit}`)
    .join(' ')} 원`;
};

// '2026-12-01' → '2026.12.01'
export const formatDotDate = (dateString) => (typeof dateString === 'string' ? dateString.slice(0, 10).replaceAll('-', '.') : '');

export const formatPeriod = (startDate, endDate) => `${formatDotDate(startDate)} ~ ${formatDotDate(endDate)}`;

// 입금일 31 = 말일
export const formatRentDay = (day) => (day == null ? null : day === 31 ? '매월 말일' : `매월 ${day}일`);

// '2026-12-25' → '12월 25일'
export const formatMonthDay = (dateString) => {
  if (typeof dateString !== 'string') return '';
  const [, month, day] = dateString.slice(0, 10).split('-').map(Number);
  return `${month}월 ${day}일`;
};

// ISO 시각 → 한국 날짜 '11월 18일'
export const formatMonthDayKST = (isoString) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};

// 오늘(KST) 'YYYY-MM-DD'
export const getTodayKST = (now = new Date()) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 두 날짜('YYYY-MM-DD') 사이 일수(to - from)
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export const formatDday = (days) => (days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`);

// 임차인에게 보이는 계약 상태 칩(Badge tone)
const TENANT_STATUS_BADGE = {
  ACTIVE: { tone: 'success', label: '계약 중' },
  EXPIRING_SOON: { tone: 'warning', label: '만료 임박' },
  UPCOMING: { tone: 'default', label: '시작 전' },
  EXPIRED: { tone: 'default', label: '만료' },
  TERMINATED: { tone: 'default', label: '해지' },
};

export const getTenantStatusBadge = (status) => TENANT_STATUS_BADGE[status] ?? { tone: 'default', label: status ?? '' };
