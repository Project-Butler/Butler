import { BookOpen, ChevronRight, PaintRoller, RefreshCw, TrendingUp, Wallet, Wrench } from 'lucide-react';

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

// 첫 화면 분쟁 유형 카드. 이름(조정위원회 조정 대상)과 짧은 예시만 두고, 누르면 상황 안내로 간다.
export const TopicTile = ({ topic, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-full min-h-11 w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2"
  >
    <TopicIcon topicKey={topic.key} />
    <span className="min-w-0 flex-1">
      <span className="block break-keep text-card font-semibold text-ink">{topic.label}</span>
      <span className="mt-0.5 block text-sub text-ink-2">{topic.hint}</span>
    </span>
    <ChevronRight size={16} className="shrink-0 text-ink-3" />
  </button>
);
