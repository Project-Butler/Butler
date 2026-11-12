import checkIcon from './assets/icon-check.svg';

// 약관 동의 한 줄 (Figma M02 약관 카드): 20px 네모(체크되면 accent 바탕 + 흰 체크) + 문구. 진짜 체크박스는 화면 밖에 숨겨 두고 라벨로 누른다.
export const AgreementRow = ({ id, checked, onChange, error, children }) => (
  <div className="flex flex-col gap-1 py-2">
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-body text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
          checked ? 'bg-accent' : 'border border-line bg-surface'
        }`}
      >
        {checked && <img src={checkIcon} alt="" width={14} height={14} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
    {error && (
      <p id={`${id}-error`} className="pl-[30px] text-m-sub text-crit-ink">
        {error}
      </p>
    )}
  </div>
);
