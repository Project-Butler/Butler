export const Badge = ({ children, tone = 'default' }) => {
  const toneClass =
    tone === 'success'
      ? 'bg-ok-soft text-ok-ink'
      : tone === 'danger'
        ? 'bg-crit-soft text-crit-ink'
        : tone === 'warning'
          ? 'bg-warn-soft text-warn-ink'
          : 'bg-surface-2 text-ink-2';

  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{children}</span>;
};
