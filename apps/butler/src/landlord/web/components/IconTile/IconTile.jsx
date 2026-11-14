// 선 아이콘(lucide) + 둥근 사각 바탕. 글자·이모지 아이콘은 쓰지 않는다.
// tone은 토큰 색만: accent(기본) · seal(권리자 인증에만) · warn · ok · crit · mute
const TONE_CLASS = {
  accent: 'bg-accent-soft text-accent-strong',
  seal: 'bg-seal-soft text-seal-ink',
  warn: 'bg-warn-soft text-warn-ink',
  ok: 'bg-ok-soft text-ok-ink',
  crit: 'bg-crit-soft text-crit-ink',
  mute: 'bg-surface-2 text-ink-2',
};
const SIZE_CLASS = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-11 w-11', xl: 'h-14 w-14' };
const ICON_SIZE = { sm: 17, md: 20, lg: 22, xl: 28 };

export const IconTile = ({ icon: Icon, tone = 'accent', size = 'md' }) => (
  <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-btn ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`}>
    <Icon size={ICON_SIZE[size]} strokeWidth={1.8} />
  </span>
);
