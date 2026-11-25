import { useCallback } from 'react';
import { matchPath, useNavigate } from 'react-router-dom';
import { COMMUNITY_PATH } from '../routes';

// 하위 화면의 "뒤로": 앱 안에서 들어왔으면 브라우저 뒤로가기, 주소를 직접 열었으면(돌아갈 기록 없음) fallback 으로.
// 판단은 react-router 가 history state 에 두는 idx(push 때만 오르고 replace 에는 그대로)로 한다 —
// location.key 는 replace 이동(새 글 등록 → 상세)에도 바뀌어서, 주소로 연 글쓰기에서 등록한 뒤 뒤로가 앱 밖으로 나갔다.
// CommunityPage(PC "← 목록으로" · 취소 · 삭제 뒤)와 앱 뒤로 가기 바(app CommunityAppLayout)가 같이 쓴다.
export const useCommunityGoBack = (fallback) => {
  const navigate = useNavigate();
  return useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
};

// 커뮤니티 하위 화면(탭 첫 화면이 아닌 곳)과 그 화면의 탭 · 뒤로 갈 곳(fallback). CommunityPage 의 하위 경로와 같은 표다.
// section: 그 화면이 속한 탭(앱 뒤로 가기 바 제목 = 그 탭 이름). 건물 선택은 어느 탭에도 속하지 않는다.
// 앞에서부터 맞춰 본다 — posts/new 가 posts/:postId 보다 앞(‘new’를 글 id 로 읽지 않게).
const SUB_SCREENS = [
  { pattern: 'posts/new', section: 'board', fallback: () => `${COMMUNITY_PATH}/board` },
  { pattern: 'posts/:postId/edit', section: 'board', fallback: ({ postId }) => `${COMMUNITY_PATH}/posts/${postId}` },
  { pattern: 'posts/:postId', section: 'board', fallback: () => `${COMMUNITY_PATH}/board` },
  { pattern: 'polls/new', section: 'polls', fallback: () => `${COMMUNITY_PATH}/polls` },
  { pattern: 'polls/:pollId', section: 'polls', fallback: () => `${COMMUNITY_PATH}/polls` },
  { pattern: 'buildings', section: null, fallback: () => COMMUNITY_PATH },
];

// 주소 → { section, fallback } (하위 화면이 아니면 null — 탭 첫 화면 · /community)
export const findCommunitySubScreen = (pathname) => {
  for (const screen of SUB_SCREENS) {
    const match = matchPath(`${COMMUNITY_PATH}/${screen.pattern}`, pathname);
    if (match) return { section: screen.section, fallback: screen.fallback(match.params) };
  }
  return null;
};
