import { ChevronRight } from 'lucide-react';
import { TopicIcon } from './TopicTile';

// 분쟁 유형 카드. 임대인이 실제로 묻는 질문을 칩으로 두고(누르면 상황 안내 맨 위에 그 질문의 답을 펼친다),
// 머리를 누르면 상황 안내로 간다. 자료 수는 쓸모가 적어 보여 주지 않는다.
export const TopicGuideCard = ({ topic, questions, onOpenTopic, onOpenFaq }) => (
  <section className="flex h-full flex-col rounded-card border border-line bg-surface p-4 lg:p-5">
    <button type="button" onClick={() => onOpenTopic(topic.key)} className="group flex min-h-11 items-center gap-3 text-left">
      <TopicIcon topicKey={topic.key} />
      <span className="min-w-0 flex-1 text-card font-semibold text-ink group-hover:text-accent-strong">{topic.label}</span>
      <ChevronRight size={16} className="shrink-0 text-ink-3" />
    </button>
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {questions.map((question) => (
        <li key={question.label}>
          <button
            type="button"
            onClick={() => onOpenFaq(topic.key, question.faq)}
            className="min-h-9 rounded-full bg-surface-2 px-3 text-sub text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent-strong"
          >
            {question.label}
          </button>
        </li>
      ))}
    </ul>
  </section>
);
