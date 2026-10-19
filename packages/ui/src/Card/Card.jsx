export const Card = ({ children, className = '' }) => {
  return <div className={`rounded-card border border-line bg-white p-4 shadow-sm ${className}`}>{children}</div>;
};
