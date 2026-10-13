export const Button = ({ children, variant = 'primary', ...props }) => {
  const variantClass =
    variant === 'secondary'
      ? 'bg-white text-gray-900 border border-gray-300'
      : 'bg-gray-900 text-white';

  return (
    <button type="button" className={`rounded px-4 py-2 text-sm font-medium ${variantClass}`} {...props}>
      {children}
    </button>
  );
};
