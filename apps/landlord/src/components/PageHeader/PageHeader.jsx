import { ChevronLeft } from 'lucide-react';

// 하위 화면 상단: 뒤로(44×44) + 제목 + 오른쪽 단계 `1 / 2`(숫자 글꼴) — design.md §5 내비게이션.
// AppShell 헤더에 기대지 않고 페이지가 직접 그려서, 나중에 모바일 셸로 옮겨도 그대로 쓴다.
export const PageHeader = ({ title, onBack, step, totalSteps }) => (
  <div className="flex items-center gap-2">
    {onBack && (
      <button
        type="button"
        aria-label="뒤로"
        onClick={onBack}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ChevronLeft size={22} />
      </button>
    )}
    <h1 className="flex-1 text-h1 font-semibold text-ink">{title}</h1>
    {step && totalSteps && (
      <span className="font-num text-body font-semibold tabular-nums text-ink-3">
        {step} / {totalSteps}
      </span>
    )}
  </div>
);
