import { Bot } from 'lucide-react';

const EXAMPLE_QUESTIONS = [
  '계약이 끝났는데 세입자가 이사를 안 나가요.',
  '월세를 올리고 싶은데 얼마까지 올릴 수 있나요?',
  '세입자가 계약갱신을 요구하는데 실거주하려면 어떻게 하나요?',
  '퇴거할 때 벽지 훼손 비용을 보증금에서 빼도 되나요?',
];

// compact: 앱(휴대폰)에서 위아래 여백을 줄여 예시 질문이 입력창에 가리지 않게 한다.
export const EmptyChat = ({ onPick, disabled, compact = false }) => (
  <div className={`flex flex-col items-center text-center ${compact ? 'py-2' : 'px-4 py-10'}`}>
    <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent-soft text-accent-strong">
      <Bot size={24} />
    </span>
    <p className="mt-4 text-section font-semibold text-ink">임대차 분쟁, 비슷한 사례부터 찾아볼게요</p>
    <p className="mt-1 text-body text-ink-2">상황을 적어 주시면 조정사례·판례를 근거로 쟁점과 판단을 정리해 드려요.</p>

    <div className={`grid w-full max-w-xl gap-2 sm:grid-cols-2 ${compact ? 'mt-4' : 'mt-6'}`}>
      {EXAMPLE_QUESTIONS.map((question) => (
        <button
          key={question}
          type="button"
          disabled={disabled}
          onClick={() => onPick(question)}
          className={`min-h-11 rounded-btn border border-line bg-surface px-4 text-left ${compact ? 'py-2.5' : 'py-3'} text-body text-ink transition-colors [@media(hover:hover)]:hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-3`}
        >
          {question}
        </button>
      ))}
    </div>
  </div>
);
