import { Search, X } from 'lucide-react';

// 분쟁 해결사 검색 칸. 입력하는 동안 화면이 바로 거르고(onChange), Enter(onSubmit)는 기다리지 않고 바로 검색한다.
export const SearchBox = ({ value, onChange, onSubmit, onClear }) => (
  <form
    role="search"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit?.(value.trim());
    }}
    className="flex h-12 items-center gap-2 rounded-input border border-line bg-surface pl-3.5 pr-1 transition-colors focus-within:border-accent"
  >
    <Search size={18} className="shrink-0 text-ink-3" />
    <label htmlFor="dispute-search" className="sr-only">
      분쟁 질문·사례 검색
    </label>
    <input
      id="dispute-search"
      type="text"
      enterKeyHint="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="상황이나 궁금한 점을 입력하세요. 예: 도배비"
      className="min-w-0 flex-1 bg-transparent text-card text-ink outline-none placeholder:text-ink-3"
    />
    {value && onClear && (
      <button
        type="button"
        onClick={onClear}
        aria-label="검색어 지우기"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X size={18} />
      </button>
    )}
  </form>
);
