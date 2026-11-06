// ISO 8601 시각을 한국 시간 "MM-DD HH:mm"으로 바꾼다(design.md §7-3).
// sv-SE 로케일은 "2026-10-20 18:30:00" 형식이라 잘라 쓰기 쉽다.
export const formatShortDateTime = (isoString) =>
  new Date(isoString).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5, 16);
