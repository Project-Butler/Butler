import { BASE_PATH, HOME_PATH } from '../web/routes';

// 임대인 앱 하단 탭 5칸 (Figma IA 기준 임시 — 탭 구성은 나중에 다시 정한다). 웹과 같은 주소를 쓴다.
// 순서는 홈 · 커뮤니티 · 내 자산(가운데) · 분쟁 센터 · 내 정보(#215).
// subPaths: 탭 주소 말고도 이 탭을 활성으로 볼 주소 접두어. 내 자산에서 들어가는 호실 상세(M06)·하우스 로그(M08)·수리·점검(M09)·소통(M10)·문서함(M11)은 '내 자산'이다.
// 계약 상세(M07)는 하단 탭이 없는 화면이고, 계약 목록(/landlord/contracts)은 아직 어느 탭에도 속하지 않는다.
// 분쟁 센터는 /disputes 아래 화면(상황 안내·자료 찾기·사례 상세)도 켜진다. AI 상담(/disputes/chat)은 하단 탭이 없는 화면이다.
export const TABS = [
  { key: 'home', label: '홈', icon: 'home', path: HOME_PATH },
  { key: 'community', label: '커뮤니티', icon: 'users', path: `${BASE_PATH}/community` },
  {
    key: 'assets',
    label: '내 자산',
    icon: 'building',
    path: `${BASE_PATH}/buildings`,
    subPaths: [`${BASE_PATH}/properties`, `${BASE_PATH}/logs`, `${BASE_PATH}/tickets`, `${BASE_PATH}/threads`, `${BASE_PATH}/documents`],
  },
  { key: 'disputes', label: '분쟁 센터', icon: 'scale', path: `${BASE_PATH}/disputes` },
  { key: 'me', label: '내 정보', icon: 'user', path: `${BASE_PATH}/settings` },
];

export const SETTINGS_PATH = `${BASE_PATH}/settings`;

const matchesPrefix = (prefix, pathname) => pathname === prefix || pathname.startsWith(`${prefix}/`);

// 탭 주소 자신이거나 그 아래 주소(/landlord/community/posts/1)일 때 그 탭이 활성이다. '/landlord/communityx' 같은 접두어 유사 주소는 아니다.
export const isTabActive = (tab, pathname) =>
  matchesPrefix(tab.path, pathname) || (tab.subPaths ?? []).some((prefix) => matchesPrefix(prefix, pathname));
