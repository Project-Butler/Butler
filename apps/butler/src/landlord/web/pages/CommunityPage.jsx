import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetCommunityPost } from '../hooks/useGetCommunityPost';
import { useGetMyBuildings } from '../hooks/useGetMyBuildings';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { CommunitySurfaceProvider } from '../components/CommunityLayout/CommunitySurface';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { useNicknameGate } from '../components/CommunityNickname/useNicknameGate';
import { loadCurrentComplexId, pickCurrentBuilding, saveCurrentComplexId } from '../utils/communityCurrentBuilding';
import { useCommunityGoBack as useGoBack } from '../utils/communityNavigation';
import { getRegionPreview } from '../utils/communityPreview';
import { COMMUNITY_PATH } from '../routes';
import { CommunityBriefingPage } from './CommunityBriefingPage';
import { CommunityPostListPage } from './CommunityPostListPage';
import { CommunityBuildingSelectPage } from './CommunityBuildingSelectPage';
import { CommunityMarketPage } from './CommunityMarketPage';
import { CommunityNewsPage } from './CommunityNewsPage';
import { CommunityPollDetailPage } from './CommunityPollDetailPage';
import { CommunityPollListPage } from './CommunityPollListPage';
import { CommunityPollWritePage } from './CommunityPollWritePage';
import { CommunityPostDetailPage } from './CommunityPostDetailPage';
import { CommunityPostWritePage } from './CommunityPostWritePage';

// 앱 주소는 /landlord/community/… 이고(COMMUNITY_PATH), LandlordWebRoutes 의 <Route path="/community/*"> 아래 중첩 경로다.
//   /community            → /community/briefing 으로 바꿔 끼운다(첫 화면 = 브리핑, 주소를 하나로)
//   /community/buildings  건물 선택(등록 호실 0개 빈 상태 · 주소로 직접 들어온 경우만)
//   /community/{briefing,news,market,board,polls}  탭 다섯 개(이 순서)
//   /community/posts/new · /community/posts/:postId · /community/posts/:postId/edit
//   /community/polls/new · /community/polls/:pollId
// 현재 건물은 경로에 넣지 않고 localStorage(utils/communityCurrentBuilding.js).
// 화면은 LandlordLayout 안의 PC 페이지다 — 머리 · 탭 줄은 CommunityFrame.
const DEFAULT_TAB_PATH = `${COMMUNITY_PATH}/briefing`;

// 하위 화면의 "뒤로"는 utils/communityNavigation useCommunityGoBack — 앱 뒤로 가기 바도 같은 규칙 · 같은 fallback 표를 쓴다.

const PollDetailRoute = ({ frame }) => {
  const { pollId } = useParams();
  const goBack = useGoBack(`${COMMUNITY_PATH}/polls`);
  return <CommunityPollDetailPage key={pollId} pollId={pollId} frame={frame} onBack={goBack} />;
};

const PollNewRoute = ({ building, frame }) => {
  const navigate = useNavigate();
  const goBack = useGoBack(`${COMMUNITY_PATH}/polls`);
  return (
    <CommunityPollWritePage
      frame={frame}
      building={building}
      onBack={goBack}
      // 새 투표는 상세로 바꿔 끼운다 — 뒤로가기가 빈 등록 화면이 아니라 목록으로 가게
      onSaved={(saved) => navigate(`${COMMUNITY_PATH}/polls/${saved.id}`, { replace: true })}
    />
  );
};

// 건물을 고르면 /community(브리핑)로 간다.
const BuildingSelectRoute = ({ buildings, current, onSelect, onRegister }) => {
  const navigate = useNavigate();
  return (
    <CommunityBuildingSelectPage
      buildings={buildings}
      currentComplexId={current?.complexId}
      onRegister={onRegister}
      onSelect={(complexId) => {
        onSelect(complexId);
        navigate(COMMUNITY_PATH);
      }}
    />
  );
};

const PostDetailRoute = ({ building, frame }) => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack(`${COMMUNITY_PATH}/board`);
  return (
    <CommunityPostDetailPage
      key={postId}
      postId={postId}
      frame={frame}
      building={building}
      onBack={goBack}
      onEdit={() => navigate(`${COMMUNITY_PATH}/posts/${postId}/edit`)}
    />
  );
};

const PostNewRoute = ({ building, frame }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack(`${COMMUNITY_PATH}/board`);
  const category = new URLSearchParams(location.search).get('category') ?? undefined;
  return (
    <CommunityPostWritePage
      frame={frame}
      building={building}
      defaultCategory={category}
      onBack={goBack}
      // 새 글은 상세로 바꿔 끼운다 — 뒤로가기가 빈 글쓰기 화면이 아니라 목록으로 가게
      onSaved={(saved) => navigate(`${COMMUNITY_PATH}/posts/${saved.id}`, { replace: true })}
    />
  );
};

// 수정은 상세 캐시(없으면 다시 불러온 것)로 글쓰기 화면을 채운다.
const PostEditRoute = ({ building, frame }) => {
  const { postId } = useParams();
  const post = useGetCommunityPost(postId);
  const goBack = useGoBack(`${COMMUNITY_PATH}/posts/${postId}`);
  if (!post.data) {
    return (
      <CommunityFrame frame={frame} section="board" onBack={goBack} narrow>
        {post.isError ? <NoticeBox>{getErrorMessage(post.error)}</NoticeBox> : <LoadingStatus />}
      </CommunityFrame>
    );
  }
  return <CommunityPostWritePage key={postId} frame={frame} building={building} post={post.data} onBack={goBack} onSaved={goBack} />;
};

const CommunityRoutes = ({ onNavigate }) => {
  const { data: buildings, isPending, isError, error } = useGetMyBuildings();
  const [storedComplexId, setStoredComplexId] = useState(loadCurrentComplexId);
  // 닉네임 대화상자 — 머리 버튼 · 글쓰기 · 투표 만들기 · 댓글 등록이 같이 쓴다(frame.nickname). 미리보기 표기는 지금 고른 건물 기준
  const nickname = useNicknameGate(buildings ? pickCurrentBuilding(buildings, storedComplexId)?.complexId : undefined);

  const selectBuilding = (complexId) => {
    saveCurrentComplexId(complexId);
    setStoredComplexId(complexId);
  };

  if (isPending || isError) {
    return (
      <div className="w-full max-w-6xl space-y-6 pb-10">
        {isPending ? <LoadingStatus /> : <NoticeBox>{getErrorMessage(error)}</NoticeBox>}
      </div>
    );
  }

  const current = pickCurrentBuilding(buildings, storedComplexId);
  // 커뮤니티 밖(A팀 화면)으로 나가는 곳만 onNavigate — 호실 등록 · 권리자 인증
  const register = onNavigate ? () => onNavigate('propertyRegister') : undefined;
  const selectProps = { buildings, current, onSelect: selectBuilding, onRegister: register };

  // 등록한 호실이 없으면(인증 전 건물도 목록에 들어온다) 어느 주소로 와도 건물 선택(빈 상태)을 보여 준다.
  if (!current) return <BuildingSelectRoute {...selectProps} />;

  // frame: 화면마다 CommunityFrame(머리 · 탭 줄)에 넘기는 것. preview: 이 동네 미리보기 상태, verify: 권리자 인증 화면으로
  const preview = getRegionPreview(buildings, current);
  const verify =
    onNavigate && preview.verifyPropertyId ? () => onNavigate('propertyVerify', { propertyId: preview.verifyPropertyId }) : undefined;
  const frame = { building: current, buildings, onSelectBuilding: selectBuilding, preview, verify, nickname };
  const props = { building: current, frame };
  return (
    <Routes>
      <Route index element={<Navigate to={DEFAULT_TAB_PATH} replace />} />
      <Route path="buildings" element={<BuildingSelectRoute {...selectProps} />} />
      <Route path="briefing" element={<CommunityBriefingPage {...props} />} />
      <Route path="market" element={<CommunityMarketPage {...props} />} />
      <Route path="news" element={<CommunityNewsPage {...props} />} />
      <Route path="board" element={<CommunityPostListPage {...props} />} />
      <Route path="polls" element={<CommunityPollListPage {...props} />} />
      <Route path="polls/new" element={<PollNewRoute {...props} />} />
      <Route path="polls/:pollId" element={<PollDetailRoute {...props} />} />
      <Route path="posts/new" element={<PostNewRoute {...props} />} />
      <Route path="posts/:postId" element={<PostDetailRoute {...props} />} />
      <Route path="posts/:postId/edit" element={<PostEditRoute {...props} />} />
      <Route path="*" element={<Navigate to={DEFAULT_TAB_PATH} replace />} />
    </Routes>
  );
};

// 커뮤니티 안 이동은 react-router. App 이 넘기는 onNavigate 는 커뮤니티 밖(호실 등록 · 권리자 인증)으로 나갈 때만 쓴다.
// react-query 는 앱 공용 QueryClientProvider(main.jsx)를 쓴다.
// isApp: 임대인 앱(app CommunityAppLayout)이 그릴 때 — 페이지는 같고 틀 · 대화상자 · 글쓰기 버튼만 앱 배치(CommunitySurface).
// Sheet: 앱에서 대화상자 대신 쓰는 아래 시트(앱 틀이 넘긴다 — web 은 app/ 를 import 하지 않는다). 웹(LandlordWebRoutes)은 둘 다 넘기지 않는다.
export const CommunityPage = ({ onNavigate, isApp = false, Sheet = null }) => (
  <CommunitySurfaceProvider isApp={isApp} Sheet={Sheet}>
    <CommunityRoutes onNavigate={onNavigate} />
  </CommunitySurfaceProvider>
);
