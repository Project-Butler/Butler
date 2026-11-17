import { Bot } from 'lucide-react';
import { Button } from '@butler/ui';

// "찾다가 없을 때"의 AI 입구. 자료 찾기 맨 끝·상황 안내 맨 끝이 같은 카드를 쓴다(문구·아이콘을 화면마다 따로 두지 않음).
// 아이콘은 챗봇 화면(EmptyChat)과 같은 Bot이라, 누르면 그 화면으로 간다는 걸 알 수 있다.
export const AskAiCard = ({ onClick }) => (
  <section className="flex flex-col items-center rounded-card border border-line bg-surface px-5 py-6 text-center">
    <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent-soft text-accent-strong">
      <Bot size={20} />
    </span>
    <p className="mt-3 text-card font-semibold text-ink">답을 찾지 못하셨나요?</p>
    <p className="mt-1 text-body text-ink-2">상황을 적어 주시면 조정사례·판례를 근거로 정리해 드려요.</p>
    <Button onClick={onClick} className="mt-4 min-h-11 px-5">
      AI에게 물어보기
    </Button>
  </section>
);
