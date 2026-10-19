// 강조 박스(design.md §2-4).
// - error: 권한 오류·요청 실패 메시지(API message를 그대로)
// - seal: 권리자 인증 안내(남색은 인증 안내에만)
const TONE_CLASS = {
  error: 'border border-crit bg-crit-soft text-crit-ink',
  seal: 'bg-seal-soft text-seal-ink',
};

export const NoticeBox = ({ tone = 'error', children, className = '' }) => (
  <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-input px-4 py-3 text-body ${TONE_CLASS[tone]} ${className}`}>
    {children}
  </div>
);
