import { useCallback, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { useGetCommunityPost } from '../hooks/useGetCommunityPost';
import { useGetMyBuildings } from '../hooks/useGetMyBuildings';
import { getErrorMessage } from '../utils/getErrorMessage';
import { CommunityFrame } from '../components/CommunityLayout/CommunityFrame';
import { LoadingStatus } from '../components/CommunityLayout/LoadingStatus';
import { loadCurrentComplexId, pickCurrentBuilding, saveCurrentComplexId } from '../utils/communityCurrentBuilding';
import { CommunityPostListPage } from './CommunityPostListPage';
import { CommunityBuildingSelectPage } from './CommunityBuildingSelectPage';
import { CommunityMarketPage } from './CommunityMarketPage';
import { CommunityNewsPage } from './CommunityNewsPage';
import { CommunityPollDetailPage } from './CommunityPollDetailPage';
import { CommunityPollListPage } from './CommunityPollListPage';
import { CommunityPollWritePage } from './CommunityPollWritePage';
import { CommunityPostDetailPage } from './CommunityPostDetailPage';
import { CommunityPostWritePage } from './CommunityPostWritePage';

// App.jsx 의 <Route path="/community/*"> 아래 중첩 경로.
//   /community            → /community/market 으로 바꿔 끼운다(시세 탭 주소를 하나로)
//   /community/buildings  건물 선택(인증 건물 0개 빈 상태 · 주소로 직접 들어온 경우만)
//   /community/{market,news,board,polls}  탭 네 개
//   /community/posts/new · /community/posts/:postId · /community/posts/:postId/edit
//   /community/polls/new · /community/polls/:pollId
// 현재 건물은 경로에 넣지 않고 localStorage(utils/communityCurrentBuilding.js).
// 화면은 LandlordLayout 안의 PC 페이지다 — 머리 · 탭 줄은 CommunityFrame.
export const COMMUNITY_BASE = '/community';
const DEFAULT_TAB_PATH = `${COMMUNITY_BASE}/market`;

// 하위 화면의 "뒤로": 앱 안에서 들어왔으면 브라우저 뒤로가기, 주소를 직접 열었으면(돌아갈 기록 없음) fallback 으로.
// 판단은 react-router 가 history state 에 두는 idx(push 때만 오르고 replace 에는 그대로)로 한다 —
// location.key 는 replace 이동(새 글 등록 → 상세)에도 바뀌어서, 주소로 연 글쓰기에서 등록한 뒤 뒤로가 앱 밖으로 나갔다.
const useGoBack = (fallback) => {
  const navigate = useNavigate();
  return useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
};

const PollDetailRoute = ({ frame }) => {
  const { pollId } = useParams();
  const goBack = useGoBack(`${COMMUNITY_BASE}/polls`);
  return <CommunityPollDetailPage key={pollId} pollId={pollId} frame={frame} onBack={goBack} />;
};

const PollNewRoute = ({ building, frame }) => {
  const navigate = useNavigate();
  const goBack = useGoBack(`${COMMUNITY_BASE}/polls`);
  return (
    <CommunityPollWritePage
      frame={frame}
      building={building}
      onBack={goBack}
      // 새 투표는 상세로 바꿔 끼운다 — 뒤로가기가 빈 등록 화면이 아니라 목록으로 가게
      onSaved={(saved) => navigate(`${COMMUNITY_BASE}/polls/${saved.id}`, { replace: true })}
    />
  );
};

// 건물을 고르면 /community(시세 탭)로 간다.
const BuildingSelectRoute = ({ buildings, current, onSelect }) => {
  const navigate = useNavigate();
  return (
    <CommunityBuildingSelectPage
      buildings={buildings}
      currentComplexId={current?.complexId}
      onSelect={(complexId) => {
        onSelect(complexId);
        navigate(COMMUNITY_BASE);
      }}
    />
  );
};

const PostDetailRoute = ({ building, frame }) => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack(`${COMMUNITY_BASE}/board`);
  return (
    <CommunityPostDetailPage
      key={postId}
      postId={postId}
      frame={frame}
      building={building}
      onBack={goBack}
      onEdit={() => navigate(`${COMMUNITY_BASE}/posts/${postId}/edit`)}
    />
  );
};

const PostNewRoute = ({ building, frame }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack(`${COMMUNITY_BASE}/board`);
  const category = new URLSearchParams(location.search).get('category') ?? undefined;
  return (
    <CommunityPostWritePage
      frame={frame}
      building={building}
      defaultCategory={category}
      onBack={goBack}
      // 새 글은 상세로 바꿔 끼운다 — 뒤로가기가 빈 글쓰기 화면이 아니라 목록으로 가게
      onSaved={(saved) => navigate(`${COMMUNITY_BASE}/posts/${saved.id}`, { replace: true })}
    />
  );
};

// 수정은 상세 캐시(없으면 다시 불러온 것)로 글쓰기 화면을 채운다.
const PostEditRoute = ({ building, frame }) => {
  const { postId } = useParams();
  const post = useGetCommunityPost(postId);
  const goBack = useGoBack(`${COMMUNITY_BASE}/posts/${postId}`);
  if (!post.data) {
    return (
      <CommunityFrame frame={frame} section="board" onBack={goBack} narrow>
        {post.isError ? <NoticeBox>{getErrorMessage(post.error)}</NoticeBox> : <LoadingStatus />}
      </CommunityFrame>
    );
  }
  return <CommunityPostWritePage key={postId} frame={frame} building={building} post={post.data} onBack={goBack} onSaved={goBack} />;
};

const CommunityRoutes = () => {
  const { data: buildings, isPending, isError, error } = useGetMyBuildings();
  const [storedComplexId, setStoredComplexId] = useState(loadCurrentComplexId);

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
  const selectProps = { buildings, current, onSelect: selectBuilding };

  // 인증 건물이 없으면 어느 주소로 와도 건물 선택(빈 상태)을 보여 준다.
  if (!current) return <BuildingSelectRoute {...selectProps} />;

  // frame: 화면마다 CommunityFrame(머리 · 탭 줄)에 넘기는 것
  const frame = { building: current, buildings, onSelectBuilding: selectBuilding };
  const props = { building: current, frame };
  return (
    <Routes>
      <Route index element={<Navigate to={DEFAULT_TAB_PATH} replace />} />
      <Route path="buildings" element={<BuildingSelectRoute {...selectProps} />} />
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

// App 이 넘기는 onNavigate 는 쓰지 않는다 — 커뮤니티 안 이동은 react-router, 밖으로 나가는 곳은 A팀 사이드바·상단 바다.
// react-query 는 앱 공용 QueryClientProvider(main.jsx)를 쓴다.
export const CommunityPage = () => <CommunityRoutes />;
