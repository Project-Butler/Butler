const SIZE_CLASS = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

const VARIANT_CLASS = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-white text-ink border border-line hover:bg-surface-2',
  soft: 'bg-seal-soft text-seal-ink hover:bg-seal/15',
};

export const Button = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => {
  return (
    <button
      type="button"
      className={`rounded-btn font-medium transition-colors ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
