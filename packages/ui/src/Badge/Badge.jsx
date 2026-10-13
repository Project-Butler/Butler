export const Badge = ({ children, tone = 'default' }) => {
  const toneClass =
    tone === 'success'
      ? 'bg-green-100 text-green-800'
      : tone === 'danger'
        ? 'bg-red-100 text-red-800'
        : 'bg-gray-100 text-gray-800';

  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{children}</span>;
};
