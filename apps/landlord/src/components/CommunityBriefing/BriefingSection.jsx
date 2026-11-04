import { ChevronRight } from 'lucide-react';
import { Card } from '@butler/ui';

// 브리핑 섹션 한 칸: 머리(섹션 이름 · 범위 · 오른쪽 "더보기 ›") + 내용. 섹션마다 따로 불러오고 따로 비거나 실패한다.
// title: 섹션 이름 · scope: 범위(잠실동 · 송파구 …) · onMore: 해당 탭으로 · aside: 머리 오른쪽에 더 둘 것(예시 배지 등)
export const BriefingSection = ({ title, scope, onMore, aside, className = '', children }) => (
  <Card className={`flex flex-col overflow-hidden p-0 ${className}`}>
    <section aria-label={title} className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-card font-semibold text-ink">{title}</h2>
        {scope && <span className="min-w-0 truncate text-sub text-ink-3">{scope}</span>}
        <span className="ml-auto flex flex-none items-center gap-3">
          {aside}
          <button
            type="button"
            onClick={onMore}
            aria-label={`${title} 더보기`}
            className="inline-flex items-center text-label font-semibold text-ink-3 hover:text-ink"
          >
            더보기
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  </Card>
);
