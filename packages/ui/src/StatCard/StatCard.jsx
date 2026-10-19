import { Card } from '../Card/Card';

const HINT_TONE_CLASS = {
  ok: 'text-ok-ink',
  warn: 'text-warn-ink',
  crit: 'text-crit-ink',
  neutral: 'text-ink-3',
};

export const StatCard = ({ label, value, unit, hint, hintTone = 'neutral' }) => {
  return (
    <Card className="p-5">
      <p className="text-chip font-medium text-ink-3">{label}</p>
      <p className="mt-2 font-num text-kpi font-bold leading-none text-ink">
        {value}
        {unit && <span className="ml-1 text-body font-medium text-ink-2">{unit}</span>}
      </p>
      {hint && <p className={`mt-2 text-chip font-medium ${HINT_TONE_CLASS[hintTone]}`}>{hint}</p>}
    </Card>
  );
};
