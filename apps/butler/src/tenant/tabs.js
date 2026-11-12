import { HOME_PATH, SETTINGS_PATH } from './routes';

// 임차인 앱 하단 탭 2칸. 실제 기능 화면(계약·수리 요청 등)은 임차인 초대 기능 이후에 탭을 늘린다.
export const TABS = [
  { key: 'home', label: '홈', icon: 'home', path: HOME_PATH },
  { key: 'me', label: '내 정보', icon: 'user', path: SETTINGS_PATH },
];

// 탭 주소 자신이거나 그 아래 주소일 때 활성이다. '/tenant/homeless' 같은 접두어 유사 주소는 아니다.
export const isTabActive = (tab, pathname) => pathname === tab.path || pathname.startsWith(`${tab.path}/`);
