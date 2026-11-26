import { ExternalLink } from 'lucide-react';
import { formatKstDate } from '../../utils/communityFormat';

// 뉴스 화면의 기사 한 줄: 제목(두 줄까지) / 출처 · 날짜 + 바깥 링크 아이콘. 줄 전체가 링크라 누르면 원문을 새 창으로 연다.
// isComplex: 우리 단지 기사면 제목 앞에 작은 칩 "우리 단지"(브리핑 최근 뉴스의 칩과 같은 모양). 주지 않으면 지금 모습 그대로.
export const NewsListItem = ({ item, isComplex = false }) => (
  <li className="border-t border-line first:border-t-0">
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex items-start justify-between gap-3 py-3.5 text-ink">
      <span className="min-w-0">
        <h3 className="mb-1 line-clamp-2 text-body font-semibold group-hover:underline">
          {isComplex && (
            <span className="mr-1.5 inline-block rounded-chip bg-accent-soft px-2 py-0.5 text-chip font-semibold text-accent-strong">
              우리 단지
            </span>
          )}
          {item.title}
        </h3>
        <span className="text-sub text-ink-3">
          {item.publisher} · <span className="font-num font-medium tabular-nums">{formatKstDate(item.publishedAt)}</span>
        </span>
      </span>
      <ExternalLink size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none text-ink-3" />
    </a>
  </li>
);
