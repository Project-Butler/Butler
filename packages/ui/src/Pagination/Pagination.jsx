import { ChevronLeft, ChevronRight } from 'lucide-react';

// 보여 줄 쪽 번호 수. 현재 쪽을 가운데에 두고 앞뒤로 나눈다.
const WINDOW = 5;

const pageWindow = (page, totalPages) => {
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1));
  const end = Math.min(totalPages, start + WINDOW - 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

// 쪽 넘기기. 현재 쪽은 Ink 배경(세그먼트 선택과 같은 모양), 번호는 숫자 글꼴. 한 쪽뿐이면 그리지 않는다.
export const Pagination = ({ page, totalPages, onChange, ariaLabel = '쪽 이동' }) => {
  if (totalPages <= 1) return null;

  const buttonClass =
    'flex h-11 min-w-11 items-center justify-center rounded-input px-2 font-num text-body tabular-nums transition-colors';

  return (
    <nav aria-label={ariaLabel} className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 쪽"
        className={`${buttonClass} text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent`}
      >
        <ChevronLeft size={18} />
      </button>
      {pageWindow(page, totalPages).map((number) => (
        <button
          key={number}
          type="button"
          onClick={() => onChange(number)}
          aria-current={number === page ? 'page' : undefined}
          aria-label={`${number}쪽`}
          className={`${buttonClass} ${number === page ? 'bg-ink font-semibold text-white' : 'text-ink-2 hover:bg-surface-2'}`}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="다음 쪽"
        className={`${buttonClass} text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent`}
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  );
};
