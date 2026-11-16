import { HOME_PATH, SETTINGS_PATH, TICKETS_PATH } from './routes';

// 임차인 앱 하단 탭 3칸(시안 E): 홈 · 수리 요청 · 내 정보. 수리 요청 화면은 티켓 기능(docs/10)에서 채운다.
export const TABS = [
  { key: 'home', label: '홈', icon: 'home', path: HOME_PATH },
  { key: 'tickets', label: '수리 요청', icon: 'wrench', path: TICKETS_PATH },
  { key: 'me', label: '내 정보', icon: 'user', path: SETTINGS_PATH },
];

// 탭 주소 자신이거나 그 아래 주소일 때 활성이다. '/tenant/homeless' 같은 접두어 유사 주소는 아니다.
export const isTabActive = (tab, pathname) => pathname === tab.path || pathname.startsWith(`${tab.path}/`);
