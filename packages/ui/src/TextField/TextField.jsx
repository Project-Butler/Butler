import { useId } from 'react';

// 필수 입력 표시. 칸이 아닌 라벨(주소 선택, 드롭다운 등)에도 쓴다.
export const RequiredMark = () => (
  <span className="ml-0.5 text-crit" aria-hidden="true">
    *
  </span>
);

// 입력 칸 (design.md §5 "입력"): 라벨은 위, 오류 문구는 아래.
// numeric이면 숫자 글꼴(tabular-nums) + inputMode="decimal". suffix는 칸 안 오른쪽 단위(㎡, 층, 원 등).
// required면 라벨 옆에 빨간 *를 붙인다. 브라우저 기본 검사 말풍선은 띄우지 않도록 input에는 aria-required만 넣는다.
export const TextField = ({ label, error, hint, suffix, numeric = false, required = false, className = '', id, ...inputProps }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error || hint);

  const borderClass = error ? 'border-crit' : 'border-line focus-within:border-accent';
  const disabledClass = inputProps.disabled ? 'bg-surface-2 text-ink-3' : 'bg-surface text-ink';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-label font-semibold text-ink">
          {label}
          {required && <RequiredMark />}
        </label>
      )}
      <div className={`flex h-12 items-center gap-2 rounded-input border px-3.5 transition-colors ${borderClass} ${disabledClass}`}>
        <input
          id={inputId}
          inputMode={numeric ? 'decimal' : undefined}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={`min-w-0 flex-1 bg-transparent text-card font-normal outline-none placeholder:text-ink-3 disabled:cursor-not-allowed ${
            numeric ? 'font-num tabular-nums' : ''
          }`}
          {...inputProps}
        />
        {suffix && <span className="shrink-0 text-body text-ink-2">{suffix}</span>}
      </div>
      {error ? (
        <p id={messageId} className="text-chip text-crit-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-chip text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
};
