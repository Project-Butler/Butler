export const Card = ({ children, className = '' }) => {
  return <div className={`rounded-card border border-line bg-surface p-4 ${className}`}>{children}</div>;
};
