import { ChevronRight } from 'lucide-react';

// 앱 커뮤니티 카드 한 칸 — 휴대폰 한 줄(폭 전체). 흰 바탕 · 둥근 모서리 · 선(@butler/ui Card 와 같은 토큰).
// 머리: 제목(줄어들지 않음) · 오른쪽 "더보기 ›"(잘리지 않게 flex-none, 누르는 곳 44px) · 그 아래 범위(작은 글씨, 길면 줄을 바꾼다 — 자르지 않음).
// 내용은 목록 한 줄(AppListRows) 또는 한 줄 안내(AppNote) — 카드 안에 카드를 넣지 않는다.
// title · scope · onMore 의 문구와 "{제목} 더보기" 이름은 PC 브리핑 칸(BriefingSection)과 같다.
export const AppCard = ({ title, scope, onMore, children, className = '' }) => (
  <section aria-label={title} className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}>
    {title && (
      <div className="flex items-start justify-between gap-3 border-b border-line py-1.5 pl-4 pr-2">
        <div className="min-w-0 py-1.5">
          <h2 className="whitespace-nowrap text-m-card font-semibold text-ink">{title}</h2>
          {scope && <p className="break-words text-m-sub text-ink-3">{scope}</p>}
        </div>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            aria-label={`${title} 더보기`}
            className="flex h-11 flex-none items-center whitespace-nowrap px-2 text-m-label font-semibold text-ink-3"
          >
            더보기
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    )}
    {children}
  </section>
);

// 카드 안 한 줄 안내(불러오는 중 · 빈 상태 · 오류). 큰 빈 상자 대신 — 문구는 PC 와 같다.
// tone: 'muted'(기본) | 'error'. 두 문장(제목 + 설명)이면 children 에 둘 다 — 줄은 바뀔 수 있어도 상자는 작다
export const AppNote = ({ tone = 'muted', children }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`px-4 py-3.5 text-m-label ${tone === 'error' ? 'text-crit-ink' : 'text-ink-3'}`}>
    {children}
  </p>
);

// 목록 끝 "더 보기"(이어 붙이기) — PC 와 같은 문구("더 보기" / "불러오는 중"), 폭 전체 · 높이 44px
export const AppMoreButton = ({ list }) =>
  list.hasNextPage ? (
    <button
      type="button"
      onClick={() => list.fetchNextPage()}
      disabled={list.isFetchingNextPage}
      className="flex h-11 w-full items-center justify-center border-t border-line text-m-label font-semibold text-ink-2 disabled:text-ink-3"
    >
      {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
    </button>
  ) : null;
