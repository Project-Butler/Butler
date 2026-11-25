import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { COMMUNITY_SECTIONS } from '../../../web/components/CommunityLayout/SectionTabs';
import { CommunityPage } from '../../../web/pages/CommunityPage';
import { buildLocation, COMMUNITY_PATH } from '../../../web/routes';
import { findCommunitySubScreen, useCommunityGoBack } from '../../../web/utils/communityNavigation';
// 홈형 상단 바(검색 · 종 · 아바타 '내 계정')는 다른 탭 첫 화면과 같은 것을 쓴다 — LandlordAppRoutes 가 내보내는 훅.
// 그 파일이 이 파일을 import 하므로 서로 부르는 모양이지만, 훅은 렌더할 때만 부르므로(모듈을 읽을 때가 아니라) 순서 문제는 없다.
import { useHomeTopBar } from '../../LandlordAppRoutes';
import { CommunityAppBoardPage } from '../../pages/CommunityAppBoardPage';
import { CommunityAppBriefingPage } from '../../pages/CommunityAppBriefingPage';
import { CommunityAppMarketPage } from '../../pages/CommunityAppMarketPage';
import { CommunityAppNewsPage } from '../../pages/CommunityAppNewsPage';
import { CommunityAppPollDetailPage } from '../../pages/CommunityAppPollDetailPage';
import { CommunityAppPollsPage } from '../../pages/CommunityAppPollsPage';
import { CommunityAppPostDetailPage } from '../../pages/CommunityAppPostDetailPage';
import { AppTabShell } from '../AppTabShell/AppTabShell';
import { CommunityAppTopBarContext } from '../CommunityApp/CommunityAppFrame';
import { CommunityAppSheet } from './CommunityAppSheet';

// 임대인 앱 커뮤니티(하단 탭 '커뮤니티', /landlord/community/…)의 틀. 앱은 PC 커뮤니티의 모바일 버전 — 같은 문구 · 같은 데이터, 휴대폰에 맞는 배치.
// 라우트 · 데이터 · 동작은 웹 CommunityPage 그대로(isApp), 화면은 앱 화면으로 바꿔 끼운다(pages — app/pages/CommunityApp*Page).
// 바꿔 끼우지 않은 글쓰기 · 글 수정 · 투표 만들기는 웹 폼을 그대로 쓴다.
//   탭 첫 화면(브리핑 · 뉴스 · 시세 · 게시판 · 투표, /community): 홈형 상단 바 — 왼쪽 로고 자리에 "단지 이름 ▾"(공용 TopBar left)
//   하위 화면(글 상세 · 글쓰기 · 글 수정 · 투표 상세 · 투표 만들기 · 건물 선택): 뒤로 가기 바(backBar) — PC 의 "← 목록으로" 대신.
//     제목은 그 화면이 속한 PC 탭 이름(게시판 · 투표), 건물 선택은 하단 탭 이름(커뮤니티).
//     뒤로 가기는 PC 와 같은 규칙 · 같은 fallback(web utils/communityNavigation — 주소로 바로 들어왔으면 그 탭 목록으로)
// 대화상자(신고 · 닉네임 · 건물 바꾸기)는 아래 시트(CommunityAppSheet)로 — 컨텍스트로 넘겨 web 파일이 app/ 를 import 하지 않게 한다.
const APP_PAGES = {
  briefing: CommunityAppBriefingPage,
  news: CommunityAppNewsPage,
  market: CommunityAppMarketPage,
  board: CommunityAppBoardPage,
  polls: CommunityAppPollsPage,
  postDetail: CommunityAppPostDetailPage,
  pollDetail: CommunityAppPollDetailPage,
};

const sectionLabel = (key) => COMMUNITY_SECTIONS.find((section) => section.key === key)?.label;

export const CommunityAppLayout = ({ user, onUnauthorized }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const homeTopBar = useHomeTopBar(user, onUnauthorized);
  const subScreen = findCommunitySubScreen(location.pathname);
  const goBack = useCommunityGoBack(subScreen?.fallback ?? COMMUNITY_PATH);
  // 상단 바 왼쪽 자리 — 화면 틀(CommunityAppFrame)이 "단지 이름 ▾" 를 이 자리에 그린다. 그 전(불러오는 중 · 건물 없음)에는 "커뮤니티"
  const [titleSlot, setTitleSlot] = useState(null);
  const [hasTitle, setHasTitle] = useState(false);
  const topBarSlot = useMemo(() => ({ slot: titleSlot, setHasTitle }), [titleSlot]);

  // 커뮤니티 밖(호실 등록 · 권리자 인증)으로 나갈 때 — 웹(LandlordWebRoutes)의 onNavigate 와 같은 약속(DisputeAppLayout 과 같다).
  const onNavigate = useCallback(
    (key, params = {}, { replace = false } = {}) => {
      const { pathname, search = '', state } = buildLocation(key, params);
      if (!replace && pathname === location.pathname && search === location.search) return;
      navigate({ pathname, search }, { replace, state });
    },
    [navigate, location.pathname, location.search],
  );

  const left = (
    <div className="flex min-w-0 items-center">
      {!hasTitle && <p className="text-m-card font-semibold text-ink">커뮤니티</p>}
      <div ref={setTitleSlot} className="min-w-0" />
    </div>
  );
  const shellBar = subScreen ? { backBar: { title: sectionLabel(subScreen.section) ?? '커뮤니티', onBack: goBack } } : { topBar: { ...homeTopBar, left } };

  return (
    <AppTabShell {...shellBar}>
      <CommunityAppTopBarContext.Provider value={topBarSlot}>
        <CommunityPage isApp Sheet={CommunityAppSheet} pages={APP_PAGES} onNavigate={onNavigate} />
      </CommunityAppTopBarContext.Provider>
    </AppTabShell>
  );
};
