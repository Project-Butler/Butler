import { BRIEFING_LOADING_TEXT } from '../../web/components/CommunityBriefing/BriefingNote';
import { useGetCommunityComplexNewsList } from '../../web/hooks/useGetCommunityComplexNewsList';
import { useGetCommunityNewsList } from '../../web/hooks/useGetCommunityNewsList';
import { useGetCommunityNewsSidoList } from '../../web/hooks/useGetCommunityNewsSidoList';
import { splitRegionName } from '../../web/utils/communityFormat';
import { getErrorMessage } from '../../web/utils/getErrorMessage';
import { AppCard, AppMoreButton, AppNote } from '../components/CommunityApp/AppCard';
import { AppNewsRow } from '../components/CommunityApp/AppListRows';
import { CommunityAppFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 뉴스 — PC 뉴스 화면(CommunityNewsPage)의 휴대폰 배치. 카드 셋을 한 줄씩(PC 의 두 칸 → 세로로): 우리 단지 · 우리 지역 · 전국 정책.
// 데이터 훅 · 규칙(우리 지역: 시·군·구 묶음 + 모자라면 서버 meta.sidoFallback 으로 "{시·도} 전체" 채움) · 문구는 PC 와 같다.
// ⚠ PC 뉴스 화면을 바꾸면(예: 11/24 "우리 단지" 카드 없앰 — 아직 올리기 전) 이 화면도 같이 바꾼다.

const NewsRows = ({ items, label }) => (
  <ul aria-label={label}>
    {items.map((item) => (
      <AppNewsRow key={item.id} item={item} />
    ))}
  </ul>
);

const ListState = ({ list }) => (
  <>
    {list.isPending && <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>}
    {list.isError && <AppNote tone="error">{getErrorMessage(list.error)}</AppNote>}
  </>
);

const ComplexNewsCard = ({ building }) => {
  const list = useGetCommunityComplexNewsList({ complexId: building.complexId });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <AppCard title="우리 단지" scope={building.name}>
      <p className="border-b border-line px-4 py-2 text-m-sub text-ink-3">단지 이름이 제목에 들어간 기사</p>
      <ListState list={list} />
      {list.isSuccess &&
        (items.length > 0 ? (
          <>
            <NewsRows items={items} label={`${building.name} 기사`} />
            <AppMoreButton list={list} />
          </>
        ) : (
          <AppNote>아직 이 단지 이름이 들어간 기사가 없습니다</AppNote>
        ))}
    </AppCard>
  );
};

const LocalNewsCard = ({ building, sigunguName }) => {
  const list = useGetCommunityNewsList({ legalDongCode: building.legalDongCode, scope: 'SIGUNGU' });
  const meta = list.data?.pages[0]?.meta;
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  const sido = useGetCommunityNewsSidoList({ legalDongCode: building.legalDongCode, enabled: meta?.sidoFallback === true });
  const sidoItems = (meta?.sidoFallback && sido.data?.data) || [];
  const isEmpty = list.isSuccess && items.length === 0 && sidoItems.length === 0 && !sido.isFetching;
  return (
    <AppCard title="우리 지역" scope={meta?.region.sigunguName ?? sigunguName}>
      <ListState list={list} />
      {isEmpty && <AppNote>수집된 기사가 없습니다.</AppNote>}
      {list.isSuccess && !isEmpty && (
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
      <ComplexNewsCard building={building} />
      <LocalNewsCard building={building} sigunguName={sigungu} />
      <NationwideNewsCard building={building} />
      <p className="text-center text-m-sub text-ink-3">누르면 원문 기사로 이동합니다</p>
    </CommunityAppFrame>
  );
};
