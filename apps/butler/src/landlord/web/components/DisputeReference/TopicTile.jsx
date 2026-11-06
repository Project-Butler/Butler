import { BookOpen, PaintRoller, RefreshCw, TrendingUp, Wallet, Wrench } from 'lucide-react';

const TOPIC_ICONS = {
  deposit: Wallet,
  restore: PaintRoller,
  repair: Wrench,
  renewal: RefreshCw,
  rent: TrendingUp,
  other: BookOpen,
};

// 상황 아이콘(타일·유형 카드 공통)
export const TopicIcon = ({ topicKey }) => {
  const Icon = TOPIC_ICONS[topicKey] ?? BookOpen;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-accent-soft text-accent-strong">
      <Icon size={20} />
    </span>
  );
};

// 분쟁 해결사 첫 화면 상황 타일. 대표 질문을 보여 줘서 "내 얘기다" 하고 고를 수 있게 한다.
export const TopicTile = ({ topic, count, sampleQuestion, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-full w-full flex-col rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2 lg:p-5"
  >
    <span className="flex items-center justify-between gap-2">
      <TopicIcon topicKey={topic.key} />
      {count !== undefined && <span className="font-num text-sub tabular-nums text-ink-3">{count}건</span>}
    </span>
    <span className="mt-3 text-card font-semibold text-ink">{topic.label}</span>
    {sampleQuestion && <span className="mt-1 line-clamp-2 text-sub text-ink-2">“{sampleQuestion}”</span>}
  </button>
);
