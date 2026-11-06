// 서버 시각(ISO 8601 UTC)을 KST 달력으로 보여 준다. 값이 없으면 '-'.
const KST_TIME_ZONE = 'Asia/Seoul';

// '2026-11-02'
export const formatDate = (iso) =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: KST_TIME_ZONE }).format(new Date(iso)) : '-';

// '2026-11-02 14:05'
export const formatDateTime = (iso) => {
  if (!iso) return '-';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: KST_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return `${formatDate(iso)} ${time}`;
};

// 대시보드 머리말용 '2026-11-02 (월)'
export const formatTodayHeading = (date = new Date()) => {
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: KST_TIME_ZONE, weekday: 'short' }).format(date);
  return `${formatDate(date.toISOString())} (${weekday})`;
};
