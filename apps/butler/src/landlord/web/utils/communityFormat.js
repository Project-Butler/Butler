// API 시각(ISO 8601)을 한국 시간으로(design.md §7-3). sv-SE 로케일은 "2026-10-20 14:32:00" 형식이다.
const toKst = (isoString) => new Date(isoString).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });

export const formatKstDate = (isoString) => toKst(isoString).slice(0, 10); // 2026-10-20
export const formatKstShortDate = (isoString) => formatKstDate(isoString).slice(5); // 10-20 (목록 표의 작성일, design.md §7-3)
export const formatKstDateTime = (isoString) => toKst(isoString).slice(0, 16); // 2026-10-20 14:32

// 마감까지 남은 날(한국 날짜 기준). 오늘 마감이면 0. 투표 D-day 칩이 쓴다(design.md §7-3 "D-day 로").
export const daysUntilKst = (isoString, now = new Date()) => {
  const toDay = (date) => Date.parse(formatKstDate(date.toISOString()));
  return Math.round((toDay(new Date(isoString)) - toDay(now)) / 86400000);
};

export const formatDday = (days) => (days === 0 ? 'D-day' : `D-${days}`);

// 지역 fullName("서울특별시 송파구 잠실동", "경기도 수원시 장안구 파장동")을 시·도 / 시·군·구 / 법정동으로 나눈다.
// 탭마다 범위를 밝히는 안내 줄이 쓴다 — 서버 응답(my-buildings regionName)을 바꾸지 않으려고 화면에서 나눈다.
export const splitRegionName = (fullName = '') => {
  const tokens = fullName.split(/\s+/).filter(Boolean);
  return { sido: tokens[0] ?? '', sigungu: tokens.slice(1, -1).join(' '), dong: tokens.length > 1 ? tokens[tokens.length - 1] : '' };
};
