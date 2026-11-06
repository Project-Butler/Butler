import { ExternalLink } from 'lucide-react';
import { useGetCommunityNewsList } from '../../hooks/useGetCommunityNewsList';
import { useGetCommunityNewsSidoList } from '../../hooks/useGetCommunityNewsSidoList';
import { formatKstShortDate } from '../../utils/communityFormat';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

export const BRIEFING_NEWS_SIZE = 5;

// 브리핑 — 최근 뉴스: 뉴스 탭 "우리 지역" 규칙 그대로 최신 5건 — 시·군·구 기사가 모자라면(서버 meta.sidoFallback) 시·도 기사로 채운다.
// 한 줄 = 제목(한 줄 말줄임) · 출처 · 날짜, 줄을 누르면 원문 새 창.
export const BriefingNews = ({ building, sigunguName, onMore, className = '' }) => {
  const list = useGetCommunityNewsList({ legalDongCode: building.legalDongCode, scope: 'SIGUNGU', size: BRIEFING_NEWS_SIZE });
  const first = list.data?.pages[0];
  const needsSido = first?.meta.sidoFallback === true && first.data.length < BRIEFING_NEWS_SIZE;
  const sido = useGetCommunityNewsSidoList({ legalDongCode: building.legalDongCode, enabled: needsSido, size: BRIEFING_NEWS_SIZE });
  const items = [...(first?.data ?? []), ...((needsSido && sido.data?.data) || [])].slice(0, BRIEFING_NEWS_SIZE);

  let body;
  if (list.isPending || (needsSido && sido.isPending && items.length === 0)) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (list.isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (items.length === 0) body = <BriefingNote>수집된 기사가 없습니다</BriefingNote>;
  else {
    body = (
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-line last:border-b-0">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{item.title}</span>
              <span className="flex-none whitespace-nowrap text-sub text-ink-3">
                {item.publisher ? `${item.publisher} · ` : ''}
                <span className="font-num tabular-nums">{formatKstShortDate(item.publishedAt)}</span>
              </span>
              <ExternalLink size={14} className="flex-none text-ink-3" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <BriefingSection title="최근 뉴스" scope={first?.meta.region?.sigunguName ?? sigunguName} onMore={onMore} className={className}>
      {body}
    </BriefingSection>
  );
};
