// 켬·끔 스위치(role="switch"). 이름은 label 로 읽힌다. 누르면 onChange(!checked).
export const Switch = ({ checked, onChange, label, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-dash'}`}
  >
    <span
      aria-hidden="true"
      className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
    />
  </button>
);
