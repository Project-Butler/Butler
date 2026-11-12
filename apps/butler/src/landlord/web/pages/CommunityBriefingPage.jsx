import { useNavigate } from 'react-router-dom';
import { COMMUNITY_PATH } from '../routes';
import { BriefingDeals } from '../components/CommunityBriefing/BriefingDeals';
import { BriefingMarket } from '../components/CommunityBriefing/BriefingMarket';
import { BriefingNews } from '../components/CommunityBriefing/BriefingNews';
import { BriefingPolls } from '../components/CommunityBriefing/BriefingPolls';
import { BriefingPosts } from '../components/CommunityBriefing/BriefingPosts';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { AREA_BANDS, pickAreaBands } from '../utils/communityMarketSummary';
import { splitRegionName } from '../utils/communityFormat';

// 브리핑 — 커뮤니티의 첫 화면(/community/briefing). 동네 소식을 훑어보는 화면이다.
// 시세 · 최근 거래 · 최근 게시글 · 최근 뉴스 · 최근 투표를 조금씩, 섹션마다 "더보기 ›" 로 그 탭에 들어간다.
// 데이터는 이미 있는 목록 API · 훅을 적게(size) 불러 쓴다 — 브리핑 전용 서버 API 는 없다.
// 섹션마다 따로 불러오고 따로 비거나 실패한다(하나가 실패해도 나머지는 보인다).
// 인증 전에도 전부 보인다. 게시글 · 투표를 누르면 상세가 잠금 화면이 된다(서버가 잠근다).
// 범위 안내 줄은 두지 않는다 — 섹션마다 머리에 범위를 적는다.
export const CommunityBriefingPage = ({ frame, building }) => {
  const navigate = useNavigate();
  const { dong, sigungu } = splitRegionName(building.regionName);
  const band = AREA_BANDS.find((item) => item.key === pickAreaBands(building.unitAreas ?? []).defaultKey);
  const go = (path) => () => navigate(`${COMMUNITY_PATH}/${path}`);

  return (
    <CommunityFrame frame={frame} section="briefing">
      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <BriefingMarket building={building} band={band} onMore={go('market')} className="lg:col-span-2" />
        <BriefingDeals building={building} band={band} onMore={go('market')} />
      </div>
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <BriefingPosts building={building} dongName={dong} onOpen={(id) => navigate(`${COMMUNITY_PATH}/posts/${id}`)} onMore={go('board')} />
        <BriefingNews building={building} sigunguName={sigungu} onMore={go('news')} />
      </div>
      <BriefingPolls building={building} dongName={dong} onOpen={(id) => navigate(`${COMMUNITY_PATH}/polls/${id}`)} onMore={go('polls')} />
    </CommunityFrame>
  );
};
