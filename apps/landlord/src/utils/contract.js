// 계약 화면 표기·입력 도우미(명세 4) 계약 관리 D-14·D-15·D-17, design.md §7).
// 숫자·날짜는 쓰는 쪽에서 font-num tabular-nums로 감싼다.
import { formatDateKST, formatNumber } from './format';

export const LEASE_TYPE_OPTIONS = [
  { value: 'MONTHLY', label: '월세' },
  { value: 'JEONSE', label: '전세' },
];

const LEASE_TYPE_LABEL = Object.fromEntries(LEASE_TYPE_OPTIONS.map(({ value, label }) => [value, label]));

export const getLeaseTypeLabel = (leaseType) => LEASE_TYPE_LABEL[leaseType] ?? leaseType;

// 계약 상태(Contract.status) → Badge. tone은 @butler/ui Badge 것만(D-17)
const CONTRACT_STATUS_BADGE = {
  ACTIVE: { tone: 'success', label: '진행 중' },
  EXPIRING_SOON: { tone: 'warning', label: '만료 임박' },
  UPCOMING: { tone: 'default', label: '시작 전' },
  EXPIRED: { tone: 'default', label: '만료' },
  TERMINATED: { tone: 'default', label: '해지' },
};

// 진행 중(ACTIVE·EXPIRING_SOON): 조건 수정 불가(D-13), 갱신 계약 등록 가능(D-14)
export const isContractInProgress = (status) => status === 'ACTIVE' || status === 'EXPIRING_SOON';

// 매도 등으로 소유 관계가 끝나면 임대인에게는 끝난 계약이다. 서버 status는 임차인도 쓰므로 날짜 기준 그대로 둔다.
const isEndedByOwnership = ({ status, endReason }) => Boolean(endReason) && (status === 'UPCOMING' || isContractInProgress(status));

export const getContractStatusBadge = (contract) =>
  isEndedByOwnership(contract)
    ? { tone: 'default', label: '끝남' }
    : (CONTRACT_STATUS_BADGE[contract.status] ?? { tone: 'default', label: contract.status });

// 목록 필터 칩(S-01). 값은 GET /contracts 쿼리에 그대로 쓴다.
export const CONTRACT_FILTERS = [
  { key: 'current', label: '진행 중', query: { status: 'ACTIVE,EXPIRING_SOON', activeOwnership: 'true' } },
  { key: 'upcoming', label: '시작 전', query: { status: 'UPCOMING', activeOwnership: 'true' } },
  { key: 'ended', label: '끝남', query: { status: 'EXPIRED,TERMINATED', includeEndedOwnership: 'true' } },
  { key: 'all', label: '전체', query: {} },
];

// 금액: 50000000 → '50,000,000원'
export const formatWon = (value) => (value == null ? null : `${formatNumber(value)}원`);

// 금액 짧게: 50000000 → '5,000만', 520000000 → '5억 2,000만', 5000000000000 → '5조'.
// 만 원 단위로 안 떨어지면 원 단위 그대로.
export const formatManwon = (value) => {
  if (value == null) return null;
  if (value === 0 || value % 10000 !== 0) return formatWon(value);
  const parts = [
    [Math.floor(value / 1000000000000), '조'],
    [Math.floor((value % 1000000000000) / 100000000), '억'],
    [(value % 100000000) / 10000, '만'],
  ];
  return parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${formatNumber(amount)}${unit}`)
    .join(' ');
};

// 목록·홈 한 줄: 월세 '1,000만 / 50만', 전세 '전세 2억'
export const formatContractAmount = ({ leaseType, deposit, monthlyRent }) =>
  leaseType === 'JEONSE' ? `전세 ${formatManwon(deposit)}` : `${formatManwon(deposit)} / ${formatManwon(monthlyRent)}`;

export const formatPeriod = ({ startDate, endDate }) => `${startDate} ~ ${endDate}`;

// 월세 입금일(#76): 1~31, 31은 '말일'(그달에 없는 날은 그달 말일, 서버 rentPayment.js).
export const RENT_PAYMENT_LAST_DAY = 31;
export const RENT_PAYMENT_DAY_OPTIONS = Array.from({ length: RENT_PAYMENT_LAST_DAY }, (_, index) => {
  const day = index + 1;
  return { value: String(day), label: day === RENT_PAYMENT_LAST_DAY ? '말일' : `${day}일` };
});

// 25 → '매월 25일', 31 → '매월 말일', 없으면 null
export const formatRentPaymentDay = (day) => {
  if (day == null) return null;
  return day === RENT_PAYMENT_LAST_DAY ? '매월 말일' : `매월 ${day}일`;
};

// 연락처: 숫자만 남긴다(최대 11자리). 서버도 숫자만 저장한다(D-03).
export const toPhoneDigits = (value) => (value ?? '').replace(/\D/g, '').slice(0, 11);

export const isValidPhone = (digits) => /^010\d{7,8}$/.test(digits);

// 화면 표기: '01012345678' → '010-1234-5678', '0101234567' → '010-123-4567'. 입력 중인 값도 앞에서부터 나눈다.
export const formatPhone = (value) => {
  const digits = toPhoneDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  const middle = digits.length === 11 ? 4 : 3;
  return `${digits.slice(0, 3)}-${digits.slice(3, 3 + middle)}-${digits.slice(3 + middle)}`;
};

// 남은 기간(design.md §7-3): 0 → 'D-day', 7 → 'D-7', -3 → 'D+3 지남'
export const formatDday = (daysUntilEnd) => {
  if (daysUntilEnd == null) return null;
  if (daysUntilEnd === 0) return 'D-day';
  return daysUntilEnd > 0 ? `D-${daysUntilEnd}` : `D+${-daysUntilEnd} 지남`;
};

// 7일 이하·지남만 danger(D-17)
export const URGENT_DAYS = 7;

export const getDdayTone = (daysUntilEnd) => (daysUntilEnd != null && daysUntilEnd <= URGENT_DAYS ? 'danger' : 'default');

// D-day 칩은 끝나지 않은 계약(시작 전·진행 중)에만 붙인다. 만료·해지·소유가 끝난 계약은 null.
export const getContractDdayBadge = (contract) => {
  const { status, daysUntilEnd } = contract;
  if ((status !== 'UPCOMING' && !isContractInProgress(status)) || isEndedByOwnership(contract)) return null;
  const label = formatDday(daysUntilEnd);
  return label ? { tone: getDdayTone(daysUntilEnd), label } : null;
};

// 날짜 문자열(YYYY-MM-DD) 계산은 UTC 자정으로 해서 시간대 영향을 받지 않게 한다.
const toUtcDate = (dateString) => new Date(`${dateString}T00:00:00Z`);
const toDateString = (date) => date.toISOString().slice(0, 10);

export const addDays = (dateString, days) => {
  const date = toUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
};

export const addYears = (dateString, years) => {
  const date = toUtcDate(dateString);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toDateString(date);
};

// 두 날짜 사이 일수(end - start)
export const daysBetween = (startDate, endDate) => Math.round((toUtcDate(endDate) - toUtcDate(startDate)) / 86400000);

// 갱신 기본 기간(D-14): 시작 = 이전 종료일 + 1일, 종료 = 시작 + 2년 - 1일
export const RENEWAL_YEARS = 2;

export const getRenewalPeriod = (previousEndDate) => {
  const startDate = addDays(previousEndDate, 1);
  return { startDate, endDate: addDays(addYears(startDate, RENEWAL_YEARS), -1) };
};

// 오늘(한국 시간) 'YYYY-MM-DD'
export const getTodayKST = () => formatDateKST(new Date().toISOString());

// 계약 날짜 칸이 고를 수 있는 범위. 날짜 칸에 min·max를 둘 다 걸어야 Chrome에서 방향키로 연도를 넘길 때
// 275760년이나 0001년 같은 끝값으로 튀지 않는다.
export const CONTRACT_DATE_MIN = '2000-01-01';
export const CONTRACT_DATE_MAX = '2099-12-31';
export const isContractDateInRange = (dateString) =>
  Boolean(dateString) && dateString >= CONTRACT_DATE_MIN && dateString <= CONTRACT_DATE_MAX;
export const CONTRACT_DATE_RANGE_MESSAGE = '2000년부터 2099년 사이 날짜를 골라 주세요.';

export const CONTRACT_LEGAL_NOTICE = '관리용 기록이며 법적 효력이 없어요';

// 계약 응답의 endReason(소유 관계 종료 사유) → 끝난 소유 관계 문구. 끝나지 않았으면 null.
export const getEndedOwnershipNotice = (endReason) => {
  if (!endReason) return null;
  return endReason === 'SOLD' || endReason === 'SUPERSEDED' ? '소유권 이전으로 종료된 소유 관계의 계약' : '종료된 소유 관계의 계약';
};

// 해지일 최대(D-15): 오늘과 종료일 중 이른 날
export const getMaxTerminationDate = (endDate, today = getTodayKST()) => (endDate < today ? endDate : today);
