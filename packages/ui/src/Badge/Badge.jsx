// 상태 칩 (design.md §2-3). verified / pending / rejected 는 권리자 인증 상태(verificationStatus)에 대응한다.
const TONE_CLASS = {
  default: 'bg-surface-2 text-ink-2',
  success: 'bg-ok-soft text-ok-ink',
  warning: 'bg-warn-soft text-warn-ink',
  danger: 'bg-crit-soft text-crit-ink',
  verified: 'bg-seal-soft text-seal-ink',
  pending: 'border border-dashed border-line bg-surface-2 text-ink-2',
  rejected: 'bg-crit-soft text-crit-ink',
};

// mobile: 앱(모바일) 화면용 — Figma Badge 는 글자 chip 줄 높이 1.5(높이 26). 웹은 기존(1.3). D-day 처럼 숫자 글꼴 단계(1.3)인 칩은 mobile 을 주지 않는다.
export const Badge = ({ children, tone = 'default', mobile = false, className = '' }) => {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 ${mobile ? 'text-m-chip' : 'text-chip'} font-semibold ${TONE_CLASS[tone] ?? TONE_CLASS.default} ${className}`}
    >
      {children}
    </span>
  );
};
