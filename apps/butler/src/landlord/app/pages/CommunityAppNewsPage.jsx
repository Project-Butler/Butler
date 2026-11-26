import { BRIEFING_LOADING_TEXT } from '../../web/components/CommunityBriefing/BriefingNote';
import { useGetCommunityNewsList } from '../../web/hooks/useGetCommunityNewsList';
import { useLocalNewsState } from '../../web/pages/CommunityNewsPage';
import { splitRegionName } from '../../web/utils/communityFormat';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppCard, AppMoreButton, AppNote } from '../components/CommunityApp/AppCard';
import { AppNewsRow } from '../components/CommunityApp/AppListRows';
import { CommunityAppFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 뉴스 — PC 뉴스 화면(CommunityNewsPage)의 휴대폰 배치. 모든 단지가 같은 모양 — 카드 둘을 한 줄씩(PC 의 두 칸 → 세로로): 우리 지역 · 전국 정책.
// "우리 지역" 의 데이터 · 규칙은 PC 와 같은 useLocalNewsState: 맨 위에 우리 단지 기사 최신순 최대 3건(줄마다 "우리 단지" 칩 — 앱 브리핑처럼
// 날짜 줄 앞), 그 아래 시·군·구 묶음(같은 원문 주소는 뺌, 더 보기 누적), 모자라면 서버 meta.sidoFallback 으로 "{시·도} 전체" 채움.
// 단지 기사가 없거나 못 불러오면 시·군·구 묶음만(빈 안내 없음). 문구는 PC 와 같다.
// ⚠ PC 뉴스 화면을 바꾸면 이 화면도 같이 바꾼다.

const NewsRows = ({ items, label }) => (
  <ul aria-label={label}>
    {items.map((item) => (
      <AppNewsRow key={item.id} item={item} isComplex={item.isComplex} />
    ))}
  </ul>
);

const ListState = ({ list }) => (
  <>
    {list.isPending && <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>}
    {list.isError && <AppNote tone="error">{getErrorMessage(list.error)}</AppNote>}
  </>
);

const LocalNewsCard = ({ building, sigunguName }) => {
  const { list, meta, items, sidoItems, isReady, isEmpty } = useLocalNewsState({ building });
  return (
    <AppCard title="우리 지역" scope={meta?.region.sigunguName ?? sigunguName}>
      {!list.isError && !isReady && <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>}
      {list.isError && <AppNote tone="error">{getErrorMessage(list.error)}</AppNote>}
      {isEmpty && <AppNote>수집된 기사가 없습니다.</AppNote>}
      {isReady && !isEmpty && (
        <>
          {items.length > 0 ? <NewsRows items={items} label={`${meta.region.sigunguName} 기사`} /> : <AppNote>최근 기사가 없습니다.</AppNote>}
          <AppMoreButton list={list} />
          {sidoItems.length > 0 && (
            <section className="border-t border-line">
              <h3 className="bg-surface-2 px-4 py-2.5 text-m-label font-semibold text-ink-2">{meta.region.sidoLabel} 전체</h3>
              <NewsRows items={sidoItems} label={`${meta.region.sidoLabel} 전체 기사`} />
            </section>
          )}
        </>
      )}
    </AppCard>
  );
};

const NationwideNewsCard = ({ building }) => {
  const list = useGetCommunityNewsList({ legalDongCode: building.legalDongCode, scope: 'NATIONWIDE' });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <AppCard title="전국 정책">
      <ListState list={list} />
      {list.isSuccess &&
        (items.length > 0 ? (
          <>
            <NewsRows items={items} label="전국 정책 기사" />
            <AppMoreButton list={list} />
          </>
        ) : (
          <AppNote>수집된 기사가 없습니다.</AppNote>
        ))}
    </AppCard>
  );
};

export const CommunityAppNewsPage = ({ frame, building }) => {
  const { sigungu } = splitRegionName(building.regionName);
  return (
    <CommunityAppFrame frame={frame} section="news" scopeText={`${building.name} · ${sigungu} · 전국`}>
      <LocalNewsCard building={building} sigunguName={sigungu} />
      <NationwideNewsCard building={building} />
      <p className="text-center text-m-sub text-ink-3">누르면 원문 기사로 이동합니다</p>
    </CommunityAppFrame>
  );
};
