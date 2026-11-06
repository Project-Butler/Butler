import { ChevronLeft } from 'lucide-react';

// 페이지 상단(PC): 뒤로(44×44) + 제목·설명 + 오른쪽 단계 `1 / 2`(숫자 글꼴) 또는 버튼(actions).
// 저장·등록 같은 주 버튼은 하단 고정 바 대신 여기(오른쪽 위)나 폼 아래 오른쪽에 둔다.
export const PageHeader = ({ title, description, onBack, step, totalSteps, actions }) => (
  <div className="flex items-start gap-2">
    {onBack && (
      <button
        type="button"
        aria-label="뒤로"
        onClick={onBack}
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ChevronLeft size={22} />
      </button>
    )}
    <div className="min-w-0 flex-1 pt-1.5">
      <h1 className="truncate text-h1 font-semibold text-ink">{title}</h1>
      {description && <p className="mt-0.5 text-body text-ink-2">{description}</p>}
    </div>
    {step && totalSteps && (
      <span className="pt-2.5 font-num text-body font-semibold tabular-nums text-ink-3">
        {step} / {totalSteps}
      </span>
    )}
    {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
  </div>
);
