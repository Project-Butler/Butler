import { Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetCommunityComplexNewsList } from '../hooks/useGetCommunityComplexNewsList';
import { useGetCommunityNewsList } from '../hooks/useGetCommunityNewsList';
import { useGetCommunityNewsSidoList } from '../hooks/useGetCommunityNewsSidoList';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { NewsListItem } from '../components/CommunityNews/NewsListItem';
import { splitRegionName } from '../utils/communityFormat';
import { putComplexNewsFirst } from '../utils/communityNews';

// 뉴스 화면. 모든 단지가 같은 모양 — "우리 지역" · "전국 정책" 두 칸(PC 명세 4절). 모바일의 하위 탭(우리 지역 / 전국 정책)을
// 없애고 나란히 둔다. 기사는 newsProvider.js(구글 뉴스 RSS)가 모아 제목 낱말로 거른 것(규칙은 서버 newsRules.js).
// 수집 주기 문구는 두지 않는다 — cron 일정이 등록되면 넣는다.
//
// 왼쪽 "우리 지역": 맨 위에 우리 단지 기사(단지 이름이 제목에 들어간 기사) 최신순 최대 3건, 줄마다 "우리 단지" 칩.
// 그 아래 시·군·구 묶음(더 보기 누적) — 위에 올린 기사와 원문 주소가 같은 기사는 뺀다. 단지 기사가 없거나 못 불러오면
// 시·군·구 묶음만 보인다(빈 안내 없음). 시·군·구 묶음의 최근 30일 기사가 5건 미만이면(서버가 meta.sidoFallback 으로
// 알려 준다) 아래에 시·도 채움 묶음(머리말 "서울 전체", 최대 10건, 더 보기 없음).

// 우리 지역 맨 위에 올리는 우리 단지 기사 수 — 단지 기사가 많은 재건축 단지에서도 동네 기사가 밀려나지 않게
const LOCAL_COMPLEX_NEWS_SIZE = 3;

const NewsList = ({ items, label }) => (
  <ul aria-label={label} className="px-5">
    {items.map((item) => (
      <NewsListItem key={item.id} item={item} isComplex={item.isComplex} />
    ))}
  </ul>
);

const MoreButton = ({ list }) =>
  list.hasNextPage && (
    <div className="border-t border-line p-4 text-center">
      <Button variant="secondary" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
        {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
      </Button>
    </div>
  );

const CardEmpty = ({ children }) => <p className="px-5 py-10 text-center text-body text-ink-3">{children}</p>;

// 기사 카드 한 칸: 머리(제목 + 보조 글) + 내용. 표 카드(BuildingListPage)처럼 머리와 내용 사이에 선.
const NewsCard = ({ title, sub, children }) => (
  <Card className="overflow-hidden p-0">
    <div className="flex items-baseline gap-2 border-b border-line px-5 py-4">
      <h2 className="text-section font-semibold text-ink">{title}</h2>
      {sub && <span className="text-body text-ink-3">{sub}</span>}
    </div>
    {children}
  </Card>
);

// "우리 지역" 칸의 데이터 · 규칙(단지 기사 맨 위 · 중복 빼기 · 시·도 채움 · 기다렸다 함께 그리기 · 빈 상태).
// 앱 뉴스(app CommunityAppNewsPage)도 같은 것을 쓴다 — 규칙이 PC 와 같게.
export const useLocalNewsState = ({ building }) => {
  const list = useGetCommunityNewsList({ legalDongCode: building.legalDongCode, scope: 'SIGUNGU' });
  const complexList = useGetCommunityComplexNewsList({ complexId: building.complexId, size: LOCAL_COMPLEX_NEWS_SIZE });
  const meta = list.data?.pages[0]?.meta;
  const sido = useGetCommunityNewsSidoList({ legalDongCode: building.legalDongCode, enabled: meta?.sidoFallback === true });
  const { items, sidoItems } = putComplexNewsFirst({
    complexItems: complexList.data?.pages[0]?.data,
    sigunguItems: list.data?.pages.flatMap((page) => page.data),
    sidoItems: (meta?.sidoFallback && sido.data?.data) || [],
    max: LOCAL_COMPLEX_NEWS_SIZE,
  });
  // 단지 기사를 기다렸다가 함께 그린다 — 지역 기사가 먼저 뜬 뒤 단지 기사가 위로 끼어들며 줄이 밀리지 않게
  const isReady = list.isSuccess && !complexList.isLoading;
  const isEmpty = isReady && items.length === 0 && sidoItems.length === 0 && !sido.isFetching;
  return { list, meta, items, sidoItems, isReady, isEmpty };
};

const LocalNewsCard = ({ building, sigunguName }) => {
  const { list, meta, items, sidoItems, isReady, isEmpty } = useLocalNewsState({ building });

  return (
    <NewsCard title="우리 지역" sub={meta?.region.sigunguName ?? sigunguName}>
      {!list.isError && !isReady && <LoadingStatus />}
      {list.isError && <NoticeBox className="m-5">{getErrorMessage(list.error)}</NoticeBox>}
      {isEmpty && <CardEmpty>수집된 기사가 없습니다.</CardEmpty>}
      {isReady && !isEmpty && (
        <>
          {items.length > 0 ? (
            <NewsList items={items} label={`${meta.region.sigunguName} 기사`} />
          ) : (
            <CardEmpty>최근 기사가 없습니다.</CardEmpty>
          )}
          <MoreButton list={list} />
          {sidoItems.length > 0 && (
            <section className="border-t border-line">
              <h3 className="bg-surface-2 px-5 py-2.5 text-label font-semibold text-ink-2">{meta.region.sidoLabel} 전체</h3>
              <NewsList items={sidoItems} label={`${meta.region.sidoLabel} 전체 기사`} />
            </section>
          )}
        </>
      )}
    </NewsCard>
  );
};

const NationwideNewsCard = ({ building }) => {
  const list = useGetCommunityNewsList({ legalDongCode: building.legalDongCode, scope: 'NATIONWIDE' });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <NewsCard title="전국 정책">
      {list.isPending && <LoadingStatus />}
      {list.isError && <NoticeBox className="m-5">{getErrorMessage(list.error)}</NoticeBox>}
      {list.isSuccess &&
        (items.length > 0 ? (
          <>
            <NewsList items={items} label="전국 정책 기사" />
            <MoreButton list={list} />
          </>
        ) : (
          <CardEmpty>수집된 기사가 없습니다.</CardEmpty>
        ))}
    </NewsCard>
  );
};

export const CommunityNewsPage = ({ frame, building }) => {
  const { sigungu } = splitRegionName(building.regionName);
  return (
    <CommunityFrame frame={frame} section="news" scopeText={`${building.name} · ${sigungu} · 전국`}>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <LocalNewsCard building={building} sigunguName={sigungu} />
        <NationwideNewsCard building={building} />
      </div>
      <p className="text-center text-sub text-ink-3">누르면 원문 기사로 이동합니다</p>
    </CommunityFrame>
  );
};
