// 화면 표기용 숫자·날짜 포맷 (design.md §7). 숫자는 쓰는 쪽에서 font-num tabular-nums로 감싼다.
const KST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// ISO 시각 → 한국 시간 기준 'YYYY-MM-DD'
export const formatDateKST = (isoString) => (isoString ? KST_DATE_FORMAT.format(new Date(isoString)) : null);

// 1234567 → '1,234,567'
export const formatNumber = (value) => (value == null ? null : Number(value).toLocaleString('ko-KR'));

// 면적·층 한 줄 요약. 예: '전용 84.97㎡ · 12층'. 값이 없으면 빈 문자열.
export const formatUnitSpec = ({ exclusiveArea, floor }) =>
  [exclusiveArea != null ? `전용 ${exclusiveArea}㎡` : null, floor != null ? `${floor}층` : null]
    .filter(Boolean)
    .join(' · ');
