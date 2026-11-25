import { createContext, useContext } from 'react';

// 커뮤니티 화면 형태 — 'web'(PC 페이지, 기본값) · 'app'(임대인 앱). CommunityPage 가 isApp 으로 정해 아래로 내려보낸다.
// 앱은 PC 커뮤니티의 모바일 버전이다: 문구 · 동작은 같고 배치 · 모양만 다르다. 그래서 페이지는 그대로 쓰고,
// 틀(CommunityFrame) · 대화상자 틀 · 글쓰기 버튼처럼 배치가 다른 조각만 이 값을 보고 앱 모양을 그린다.
// Sheet: 앱에서 대화상자 대신 쓰는 아래 시트(앱 틀 CommunityAppLayout 이 넘긴다). web 파일이 app/ 를 import 하지 않게 컨텍스트로 받는다.
// 기본값이 웹이라 Provider 밖(웹 화면 · 기존 테스트)은 지금과 똑같다.
const CommunitySurfaceContext = createContext({ surface: 'web', isApp: false, Sheet: null });

export const CommunitySurfaceProvider = ({ isApp = false, Sheet = null, children }) => (
  <CommunitySurfaceContext.Provider value={{ surface: isApp ? 'app' : 'web', isApp, Sheet: isApp ? Sheet : null }}>
    {children}
  </CommunitySurfaceContext.Provider>
);

export const useCommunitySurface = () => useContext(CommunitySurfaceContext);
