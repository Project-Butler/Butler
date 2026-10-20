import { Button } from '@butler/ui';

// 서버(apps/api disputes controller)의 질문 길이 제한과 같다.
const MAX_QUESTION_LENGTH = 2000;

export const ChatComposer = ({ value, onChange, onSubmit, isPending }) => {
  const canSubmit = value.trim().length > 0 && value.length <= MAX_QUESTION_LENGTH && !isPending;

  const handleKeyDown = (event) => {
    // 한글 입력 중(조합 중)에 누른 Enter는 글자 확정용이라 보내지 않는다.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="rounded-card border border-line bg-surface p-3"
    >
      <label htmlFor="dispute-question" className="sr-only">
        상담 질문
      </label>
      <textarea
        id="dispute-question"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="겪고 있는 상황을 적어 주세요. 예: 계약이 끝났는데 집주인이 보증금을 안 돌려줘요."
        className="w-full resize-none rounded-input border border-line bg-surface px-3.5 py-3 text-body text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className={`font-num text-chip tabular-nums ${value.length > MAX_QUESTION_LENGTH ? 'text-crit-ink' : 'text-ink-3'}`}>
          {value.length.toLocaleString()} / {MAX_QUESTION_LENGTH.toLocaleString()}
        </p>
        <Button type="submit" disabled={!canSubmit} className="min-h-11 px-5">
          {isPending ? '답변 작성 중' : '보내기'}
        </Button>
      </div>
    </form>
  );
};
