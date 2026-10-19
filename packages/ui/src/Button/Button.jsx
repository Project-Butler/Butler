// lg: 화면 하단 고정 주요 버튼(높이 약 52, design.md §5 "모바일 하단 52")
const SIZE_CLASS = {
  lg: 'px-5 py-3.5 text-card',
  md: 'px-4 py-2 text-body',
  sm: 'px-3 py-1.5 text-chip',
};

// verify / verifyOutline(남색)은 권리자 인증 행동에만 쓴다 (design.md §2, §5)
const VARIANT_CLASS = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  verify: 'bg-seal text-white hover:bg-seal-ink',
  verifyOutline: 'bg-surface text-seal border border-seal hover:bg-seal-soft',
};

const DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-line disabled:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-surface-2';

export const Button = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => {
  return (
    <button
      type="button"
      className={`rounded-btn font-semibold transition-colors ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${DISABLED_CLASS} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
