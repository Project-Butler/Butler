// 브리핑 섹션 안의 짧은 상태 한 줄 — 불러오는 중 · 비었음 · 실패. 실패는 그 섹션 카드 안에서만 보인다(다른 섹션은 그대로).
// tone: 'muted'(기본) | 'error'
export const BriefingNote = ({ children, tone = 'muted' }) => (
  <p
    role={tone === 'error' ? 'alert' : 'status'}
    className={`px-5 py-8 text-center text-body ${tone === 'error' ? 'text-crit-ink' : 'text-ink-3'}`}
  >
    {children}
  </p>
);

export const BRIEFING_ERROR_TEXT = '불러오지 못했어요. 잠시 뒤 다시 열어 주세요';
export const BRIEFING_LOADING_TEXT = '불러오는 중입니다';
