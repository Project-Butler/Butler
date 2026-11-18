import { addDays, daysBetween } from '../../web/utils/contract';
import { BASE_PATH } from '../../web/routes';

// 일정·알림 화면(#163)과 계약 상세 갱신 거절 통지 카드가 쓰는 값·계산. 날짜는 모두 KST 'YYYY-MM-DD' 문자열이다.

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 예정 일정 목록은 오늘부터 이 날수만큼(API 한도 93일 안).
export const UPCOMING_DAYS = 60;

const toUtcDate = (dateString) => new Date(`${dateString}T00:00:00Z`);
const weekdayOf = (dateString) => toUtcDate(dateString).getUTCDay();

// dateString 이 든 주(일요일 시작)의 7일
export const getWeekDates = (dateString) => {
  const sunday = addDays(dateString, -weekdayOf(dateString));
  return Array.from({ length: 7 }, (_, index) => addDays(sunday, index));
};

const monthDay = (dateString) => {
  const [, month, day] = dateString.split('-').map(Number);
  return { month, day };
};

// 주 띠 위 제목. 주가 두 달에 걸치면 목요일이 든 달로 쓴다(ISO 주와 같은 기준).
export const formatWeekMonthLabel = (weekDates) => {
  const [year, month] = weekDates[4].split('-').map(Number);
  return `${year}년 ${month}월`;
};

export const getDayOfMonth = (dateString) => monthDay(dateString).day;

// '11월 25일 (수)'
export const formatScheduleDate = (dateString) => {
  const { month, day } = monthDay(dateString);
  return `${month}월 ${day}일 (${WEEKDAY_LABELS[weekdayOf(dateString)]})`;
};

export const getDaysUntil = (today, dateString) => daysBetween(today, dateString);

// 알림 받기 토글 → 끌 알림 type(notification-preferences 의 mutedTypes). 수리 요청·이메일 토글은 두지 않는다.
export const NOTIFICATION_TOGGLES = [
  { key: 'contractEnd', label: '계약 만기', description: '계약이 끝나기 전에 알려 드려요', types: ['CONTRACT_EXPIRING_SOON'] },
  {
    key: 'renewalNotice',
    label: '갱신 거절 통지 기한',
    description: '통지 기간이 열릴 때와 마감 30·7·1일 전',
    types: ['RENEWAL_NOTICE_WINDOW_OPEN', 'RENEWAL_NOTICE_DEADLINE_SOON'],
  },
  { key: 'rentPayment', label: '월세 입금일', description: '입금일 당일 아침', types: ['RENT_PAYMENT_DUE'] },
];

// 토글의 type 중 하나라도 꺼져 있으면 꺼진 것으로 본다(켜면 모두 켠다).
export const isToggleOn = (mutedTypes, types) => types.every((type) => !mutedTypes.includes(type));

export const setToggle = (mutedTypes, types, on) =>
  on ? mutedTypes.filter((type) => !types.includes(type)) : [...mutedTypes.filter((type) => !types.includes(type)), ...types];

// 알림 시각: 1분 안 '방금', 1시간 안 'n분 전', 하루 안 'n시간 전', 그 밖은 'M월 D일'(KST)
export const formatNotificationTime = (createdAt, now = new Date()) => {
  const diffMinutes = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000);
  if (diffMinutes < 1) return '방금';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 60 * 24) return `${Math.floor(diffMinutes / 60)}시간 전`;
  const kst = new Date(new Date(createdAt).getTime() + 9 * 3600000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};

// 알림 link('/contracts/:id')는 역할 접두어 없는 앱 경로다. 임대인 화면 주소로 바꾼다. 앱 밖 주소·'//'는 열지 않는다(null).
export const toLandlordPath = (link) => {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) return null;
  return link.startsWith(`${BASE_PATH}/`) ? link : `${BASE_PATH}${link}`;
};

// ── 갱신 거절 통지(주택임대차보호법 제6조) ──

export const RENEWAL_NOTICE_KIND_OPTIONS = [
  { value: 'REFUSE_RENEWAL', label: '갱신 거절' },
  { value: 'CHANGE_TERMS', label: '조건 변경' },
];

export const RENEWAL_NOTICE_METHOD_OPTIONS = [
  { value: 'CERTIFIED_MAIL', label: '내용증명' },
  { value: 'TEXT_MESSAGE', label: '문자' },
  { value: 'MESSENGER', label: '메신저' },
  { value: 'EMAIL', label: '이메일' },
  { value: 'IN_PERSON', label: '직접 전달' },
  { value: 'OTHER', label: '기타' },
];

const labelOf = (options, value) => options.find((option) => option.value === value)?.label ?? '기타';
export const getRenewalNoticeKindLabel = (kind) => labelOf(RENEWAL_NOTICE_KIND_OPTIONS, kind);
export const getRenewalNoticeMethodLabel = (method) => labelOf(RENEWAL_NOTICE_METHOD_OPTIONS, method);

const TIMING_BADGES = {
  IN_TIME: { tone: 'success', label: '기간 안 도달' },
  TOO_EARLY: { tone: 'warning', label: '6개월 전 도달' },
  LATE: { tone: 'danger', label: '기한 뒤 도달' },
  UNCONFIRMED: { tone: 'warning', label: '도달일 미확인' },
};
export const getRenewalNoticeTimingBadge = (timing) => TIMING_BADGES[timing] ?? TIMING_BADGES.UNCONFIRMED;

const PHASE_BADGES = {
  BEFORE_WINDOW: { tone: 'default', label: '통지 기간 전' },
  OPEN: { tone: 'success', label: '통지 기간' },
  CLOSING_SOON: { tone: 'danger', label: '마감 임박' },
  CLOSED: { tone: 'default', label: '통지 기간 지남' },
};

// 카드 머리의 상태 칩. 기간 안에 도달한 기록이 있으면 '통지 완료'.
export const getRenewalNoticePhaseBadge = (summary) =>
  summary.hasDeliveredInTime ? { tone: 'success', label: '통지 완료' } : (PHASE_BADGES[summary.phase] ?? PHASE_BADGES.OPEN);

// 카드의 안내 문장(경고). 기간 안 도달 기록이 있으면 경고하지 않는다.
export const getRenewalNoticeWarning = (summary) => {
  if (summary.hasDeliveredInTime) return null;
  switch (summary.phase) {
    case 'BEFORE_WINDOW':
      return { tone: 'info', text: `${summary.windowStart}부터 통지할 수 있어요. 그 전에 도달한 통지는 효력이 없을 수 있어요.` };
    case 'OPEN':
      return { tone: 'info', text: `갱신을 거절하거나 조건을 바꾸려면 ${summary.safeDeadline}까지 임차인에게 도달하게 하세요.` };
    case 'CLOSING_SOON':
      return { tone: 'warn', text: `마감까지 ${summary.daysUntilDeadline}일 남았어요. 도달까지 걸리는 날을 생각해 서둘러 보내세요.` };
    case 'CLOSED':
      return { tone: 'warn', text: '통지 기간이 지났어요. 기간 안에 도달한 통지가 없으면 같은 조건으로 2년 갱신된 것으로 봐요.' };
    default:
      return null;
  }
};

export const RENEWAL_NOTICE_LEGAL_NOTES = [
  '보낸 날이 아니라 임차인에게 도달한 날을 기준으로 해요.',
  '기간 안에 통지하지 않으면 같은 조건으로 2년 갱신되고, 그 뒤에는 임차인만 언제든 해지를 알릴 수 있어요(통지 3개월 뒤 효력).',
  '참고 정보이며 법률 자문이 아니에요.',
];

export const RENEWAL_NOTICE_MEMO_MAX = 500;
export const MAX_RENEWAL_NOTICE_ATTACHMENTS = 5;
