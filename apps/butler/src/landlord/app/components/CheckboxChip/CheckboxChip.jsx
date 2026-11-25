// Created: 2026-11-25 22:22
// 체크박스 칩(설비 고르기 등). 고르면 Accent soft 바탕 + Accent 테두리. 앱 부동산 등록·부동산 상세 임대 조건 수정이 같이 쓴다.
export const CheckboxChip = ({ checked, onChange, label, disabled }) => (
  <label
    className={`flex h-10 cursor-pointer items-center gap-2 rounded-input border px-3 text-body transition-colors ${
      checked ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink-2'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
  >
    <input type="checkbox" className="accent-accent" checked={checked} onChange={onChange} disabled={disabled} />
    {label}
  </label>
);
