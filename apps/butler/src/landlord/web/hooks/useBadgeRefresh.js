import { createContext, useContext } from 'react';

// 사이드바 숫자·위 막대 종을 다시 세는 함수. 레이아웃(LayoutWithBadges)이 넣고, 화면은 요청을 처리한 뒤 부른다.
// 레이아웃은 주소가 바뀔 때만 다시 세므로, 주소가 그대로인 처리(처리 시작·완료·취소·등록)는 이걸로 알린다.
export const BadgeRefreshContext = createContext(() => {});

export const useBadgeRefresh = () => useContext(BadgeRefreshContext);
