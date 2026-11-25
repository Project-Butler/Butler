import { ExternalLink } from 'lucide-react';
import { useGetCommunityComplexNewsList } from '../../hooks/useGetCommunityComplexNewsList';
import { useGetCommunityNewsList } from '../../hooks/useGetCommunityNewsList';
import { useGetCommunityNewsSidoList } from '../../hooks/useGetCommunityNewsSidoList';
import { formatKstShortDate } from '../../utils/communityFormat';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT, BriefingNote } from './BriefingNote';
import { BriefingSection } from './BriefingSection';

export const BRIEFING_NEWS_SIZE = 5;
// 우리 단지 기사는 먼저 최대 2건(PC 명세 v3 2.5절). 규칙 요약은 서버 newsRules.js 맨 아래 "화면에 보이기"
export const BRIEFING_COMPLEX_NEWS_SIZE = 2;

// 브리핑 — 최근 뉴스: 모두 5건. 우리 단지 기사를 먼저 최대 2건(줄 앞 "우리 단지" 칩), 나머지를 뉴스 탭 "우리 지역" 규칙
// (시·군·구, 모자라면 서버 meta.sidoFallback 으로 시·도)으로 채운다. 단지 기사가 없거나 못 불러와도 지금처럼 지역 5건.
// 한 줄 = 제목(한 줄 말줄임) · 출처 · 날짜, 줄을 누르면 원문 새 창.
export const BRIEFING_NEWS_EMPTY_TEXT = '수집된 기사가 없습니다';

// 데이터 · 계산(단지 기사 먼저 · 지역으로 채움 · 같은 기사 한 번) — 앱 브리핑 카드도 같은 것을 쓴다
export const useBriefingNews = ({ building, sigunguName }) => {
  const complexList = useGetCommunityComplexNewsList({ complexId: building.complexId, size: BRIEFING_COMPLEX_NEWS_SIZE });
  const complexItems = (complexList.data?.pages[0]?.data ?? []).slice(0, BRIEFING_COMPLEX_NEWS_SIZE);
  const list = useGetCommunityNewsList({ legalDongCode: building.legalDongCode, scope: 'SIGUNGU', size: BRIEFING_NEWS_SIZE });
  const first = list.data?.pages[0];
  const needsSido = first?.meta.sidoFallback === true && first.data.length < BRIEFING_NEWS_SIZE;
  const sido = useGetCommunityNewsSidoList({ legalDongCode: building.legalDongCode, enabled: needsSido, size: BRIEFING_NEWS_SIZE });
  const regionItems = [...(first?.data ?? []), ...((needsSido && sido.data?.data) || [])];
  // 같은 기사가 단지 · 지역 둘 다에 있으면 단지 쪽으로 한 번만
  const complexUrls = new Set(complexItems.map((item) => item.url));
  const items = [
    ...complexItems.map((item) => ({ ...item, isComplex: true })),
    ...regionItems.filter((item) => !complexUrls.has(item.url)),
  ].slice(0, BRIEFING_NEWS_SIZE);
  return {
    items,
    sigungu: first?.meta.region?.sigunguName ?? sigunguName,
    isLoading: list.isPending || (needsSido && sido.isPending && items.length === 0),
    isError: list.isError && items.length === 0,
  };
};

export const BriefingNews = ({ building, sigunguName, onMore, className = '' }) => {
  const { items, sigungu, isLoading, isError } = useBriefingNews({ building, sigunguName });

  let body;
  if (isLoading) body = <BriefingNote>{BRIEFING_LOADING_TEXT}</BriefingNote>;
  else if (isError) body = <BriefingNote tone="error">{BRIEFING_ERROR_TEXT}</BriefingNote>;
  else if (items.length === 0) body = <BriefingNote>{BRIEFING_NEWS_EMPTY_TEXT}</BriefingNote>;
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
              {item.isComplex && (
                <span className="flex-none rounded-chip bg-accent-soft px-2 py-0.5 text-chip font-semibold text-accent-strong">우리 단지</span>
              )}
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
    <BriefingSection title="최근 뉴스" scope={`${building.name} · ${sigungu}`} onMore={onMore} className={className}>
      {body}
    </BriefingSection>
  );
};
