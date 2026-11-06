import { ChevronRight, Sparkles } from 'lucide-react';

// "먼저 사례를 훑어보고, 못 찾으면 AI에게 묻는다" — 목록 위에 두는 AI 상담 입구.
export const AskAiCard = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-card bg-accent p-4 text-left text-white transition-colors hover:bg-accent-strong lg:p-5"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-accent-strong">
      <Sparkles size={18} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-card font-semibold">AI에게 상황 물어보기</span>
      <span className="mt-0.5 block text-sub">찾는 사례가 없으면 비슷한 사례를 찾아 답해 드려요</span>
    </span>
    <ChevronRight size={18} className="shrink-0" />
  </button>
);
