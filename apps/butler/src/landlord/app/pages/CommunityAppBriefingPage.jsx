import { useNavigate } from 'react-router-dom';
import { BRIEFING_DEALS_EMPTY_TEXT, useBriefingDeals } from '../../web/components/CommunityBriefing/BriefingDeals';
import { briefingMarketEmptyText, useBriefingMarket } from '../../web/components/CommunityBriefing/BriefingMarket';
import { BRIEFING_NEWS_EMPTY_TEXT, useBriefingNews } from '../../web/components/CommunityBriefing/BriefingNews';
import { BRIEFING_ERROR_TEXT, BRIEFING_LOADING_TEXT } from '../../web/components/CommunityBriefing/BriefingNote';
import { BRIEFING_POLLS_EMPTY_TEXT, useBriefingPolls } from '../../web/components/CommunityBriefing/BriefingPolls';
import { BRIEFING_POSTS_EMPTY_TEXT, useBriefingPosts } from '../../web/components/CommunityBriefing/BriefingPosts';
import { AppCollectingDescription } from '../components/CommunityApp/AppCollectingDescription';
import { MarketSource } from '../../web/components/CommunityMarket/MarketSource';
import { PriceChart } from '../../web/components/CommunityMarket/PriceChart';
import { COMMUNITY_PATH } from '../../web/routes';
import { splitRegionName } from '../../web/utils/communityFormat';
import { COLLECTING_BRIEFING_TEXT, collectingNotice } from '../../web/utils/communityMarketCollecting';
import { AREA_BANDS, pickAreaBands } from '../../web/utils/communityMarketSummary';
import { AppCard, AppNote } from '../components/CommunityApp/AppCard';
import { AppDealRow, AppNewsRow, AppPollRow, AppPostRow } from '../components/CommunityApp/AppListRows';
import { CommunityAppFrame } from '../components/CommunityApp/CommunityAppFrame';

// 앱 브리핑 — PC 브리핑(CommunityBriefingPage)의 휴대폰 배치. 카드는 한 줄(폭 전체)씩, 순서 · 제목은 PC 그대로:
// 시세 → 최근 거래 → 최근 게시글 → 최근 뉴스 → 최근 투표. 데이터 · 계산 · 문구는 PC 브리핑 칸의 훅 · 상수를 그대로 쓴다
// (useBriefing* — 같은 요청 · 같은 건수 · 같은 빈 상태 문구). 카드마다 따로 불러오고 따로 비거나 실패한다.

// 시세를 아직 모으는 중(COLLECTING)일 때 시세 카드 · 최근 거래 카드가 같이 쓰는 안내 — PC BriefingCollectingNote 와 같은 판단:
// 아직 시도 전이면 한 줄, 일부 모음 · 받기 실패면 두 줄(utils/communityMarketCollecting). 서버가 거래를 비워 주는 것이라 "최근 거래가 없습니다" 가 아니다(#267)
const CollectingNote = ({ prices }) => {
  const notice = collectingNotice(prices);
  if (notice.kind === 'FIRST') return <AppNote>{COLLECTING_BRIEFING_TEXT}</AppNote>;
  return (
    <AppNote>
      <span className="block font-semibold text-ink-2">{notice.title}</span>
      <span className="block">
        <AppCollectingDescription notice={notice} />
      </span>
    </AppNote>
  );
};

// 시세 카드(참고 시안 B-1 첫 카드): 큰 숫자(최근 3개월 평균) · "직전 3개월보다 ▲▼" · 무엇의 평균인지 한 줄 · 작은 흐름선 · 출처 줄
const MarketCard = ({ building, band, onMore }) => {
  const { prices, data, summary, months, values } = useBriefingMarket({ building, band });
  let body;
  if (prices.isPending) body = <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>;
  else if (prices.isError) body = <AppNote tone="error">{BRIEFING_ERROR_TEXT}</AppNote>;
  else if (data.collectionStatus === 'COLLECTING') body = <CollectingNote prices={data} />;
  else if (data.recentDeals.length === 0 && data.monthly.length === 0) body = <AppNote>{briefingMarketEmptyText(band)}</AppNote>;
  else {
    body = (
      <div className="space-y-1 px-4 py-3">
        {summary.headline && <p className="font-num text-num-kpi font-bold tabular-nums text-ink">{summary.headline}</p>}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {summary.changeText && <span className="font-num text-num-body font-medium tabular-nums text-ink-2">{summary.changeText}</span>}
          <span className="font-num text-m-sub tabular-nums text-ink-3">{summary.caption}</span>
        </p>
        <div className="pt-1">
          <PriceChart
            months={months}
            width={316}
            height={96}
            series={[{ label: '매매', strokeClass: 'stroke-accent', fillClass: 'fill-accent', dotClass: 'bg-accent', values }]}
          />
        </div>
        {data.asOf && <MarketSource source={data.source} asOf={data.asOf} className="pt-1" />}
      </div>
    );
  }
  return (
    <AppCard title="시세" scope={`${building.name} · 매매 · ${band.label}`} onMore={onMore}>
      {body}
    </AppCard>
  );
};

const DealsCard = ({ building, band, onMore }) => {
  const { prices, deals } = useBriefingDeals({ building, band });
  let body;
  if (prices.isPending) body = <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>;
  else if (prices.isError) body = <AppNote tone="error">{BRIEFING_ERROR_TEXT}</AppNote>;
  // 모으는 중이면 시세 카드와 같은 안내, "최근 거래가 없습니다" 는 다 모았는데(READY) 0건일 때만
  else if (prices.data.collectionStatus === 'COLLECTING') body = <CollectingNote prices={prices.data} />;
  else if (deals.length === 0) body = <AppNote>{BRIEFING_DEALS_EMPTY_TEXT}</AppNote>;
  else {
    body = (
      <ul aria-label="최근 거래">
        {deals.map((deal) => (
          <AppDealRow key={`${deal.contractDate}-${deal.floor}-${deal.exclusiveArea}`} deal={deal} dateFormat="short" />
        ))}
      </ul>
    );
  }
  return (
    <AppCard title="최근 거래" scope={`매매 · ${band.label}`} onMore={onMore}>
      {body}
    </AppCard>
  );
};

const PostsCard = ({ building, dongName, onOpen, onMore }) => {
  const { list, posts } = useBriefingPosts({ building });
  let body;
  if (list.isPending) body = <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>;
  else if (list.isError) body = <AppNote tone="error">{BRIEFING_ERROR_TEXT}</AppNote>;
  else if (posts.length === 0) body = <AppNote>{BRIEFING_POSTS_EMPTY_TEXT}</AppNote>;
  else {
    body = (
      <ul aria-label="최근 게시글">
        {posts.map((post) => (
          <AppPostRow key={post.id} post={post} onOpen={onOpen} />
        ))}
      </ul>
    );
  }
  return (
    <AppCard title="최근 게시글" scope={dongName} onMore={onMore}>
      {body}
    </AppCard>
  );
};

const NewsCard = ({ building, sigunguName, onMore }) => {
  const { items, sigungu, isLoading, isError } = useBriefingNews({ building, sigunguName });
  let body;
  if (isLoading) body = <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>;
  else if (isError) body = <AppNote tone="error">{BRIEFING_ERROR_TEXT}</AppNote>;
  else if (items.length === 0) body = <AppNote>{BRIEFING_NEWS_EMPTY_TEXT}</AppNote>;
  else {
    body = (
      <ul aria-label="최근 뉴스">
        {items.map((item) => (
          <AppNewsRow key={item.id} item={item} dateFormat="short" isComplex={item.isComplex} />
        ))}
      </ul>
    );
  }
  return (
    <AppCard title="최근 뉴스" scope={`${building.name} · ${sigungu}`} onMore={onMore}>
      {body}
    </AppCard>
  );
};

const PollsCard = ({ building, dongName, onOpen, onMore }) => {
  const { polls, isLoading, isError } = useBriefingPolls({ building });
  let body;
  if (isLoading) body = <AppNote>{BRIEFING_LOADING_TEXT}</AppNote>;
  else if (isError) body = <AppNote tone="error">{BRIEFING_ERROR_TEXT}</AppNote>;
  else if (polls.length === 0) body = <AppNote>{BRIEFING_POLLS_EMPTY_TEXT}</AppNote>;
  else {
    body = (
      <ul aria-label="최근 투표">
        {polls.map((poll) => (
          <AppPollRow key={poll.id} poll={poll} dongName={dongName} onOpen={onOpen} />
        ))}
      </ul>
    );
  }
  return (
    <AppCard title="최근 투표" scope={dongName} onMore={onMore}>
      {body}
    </AppCard>
  );
};

export const CommunityAppBriefingPage = ({ frame, building }) => {
  const navigate = useNavigate();
  const { dong, sigungu } = splitRegionName(building.regionName);
  const band = AREA_BANDS.find((item) => item.key === pickAreaBands(building.unitAreas ?? []).defaultKey);
  const go = (path) => () => navigate(`${COMMUNITY_PATH}/${path}`);
  return (
    <CommunityAppFrame frame={frame} section="briefing">
      <MarketCard building={building} band={band} onMore={go('market')} />
      <DealsCard building={building} band={band} onMore={go('market')} />
      <PostsCard building={building} dongName={dong} onOpen={(id) => navigate(`${COMMUNITY_PATH}/posts/${id}`)} onMore={go('board')} />
      <NewsCard building={building} sigunguName={sigungu} onMore={go('news')} />
      <PollsCard building={building} dongName={dong} onOpen={(id) => navigate(`${COMMUNITY_PATH}/polls/${id}`)} onMore={go('polls')} />
    </CommunityAppFrame>
  );
};
