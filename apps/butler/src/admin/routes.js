import { generatePath, matchPath } from 'react-router-dom';

// 관리자 화면은 앱 안에서 /admin 아래에 놓인다(임대인 /landlord, 임차인 /tenant와 겹치지 않게).
// 아래 ROUTE_TABLE의 경로는 이 접두어 기준의 상대 경로이고, 접두어는 buildLocation·resolveViewKey가 붙이고 뗀다.
// <Routes>는 /admin/* 안에서 접두어 없는 경로로 맞춘다.
export const BASE_PATH = '/admin';

// 메인 대시보드. '/admin'으로 들어오면 여기로 보낸다. Navigate에는 접두어를 포함한 HOME_PATH를 쓴다.
const HOME = '/dashboard';
export const HOME_PATH = `${BASE_PATH}${HOME}`;

// 화면 key ↔ URL 경로. 화면 컴포넌트는 onNavigate(key, params)로 이동하고, 이 파일이 key를 경로로 바꾼다.
// 운영 API가 붙기 전인 메뉴(계약 등)도 경로는 미리 정해 두고, App이 '준비 중' 화면을 보여 준다.
// navKey: 메뉴에 없는 하위 화면(상세)에서 켜 둘 메뉴 key.
export const ROUTE_TABLE = [
  { key: 'dashboard', path: HOME },
  { key: 'users', path: '/users' },
  { key: 'userDetail', path: '/users/:userId', navKey: 'users' },
  { key: 'ownerships', path: '/ownerships' },
  { key: 'verificationAttempts', path: '/ownership-verification-attempts' },
  { key: 'complexes', path: '/complexes/new' },
  { key: 'jobs', path: '/jobs' },
  { key: 'auditLogs', path: '/audit-logs' },
  { key: 'contracts', path: '/contracts' },
  { key: 'contractDetail', path: '/contracts/:contractId', navKey: 'contracts' },
  { key: 'tickets', path: '/tickets' },
  { key: 'documents', path: '/documents' },
  { key: 'settings', path: '/settings' },
];

// 접두어(/admin)를 뗀다. /admin 밖의 경로('/users', '/admin-x/users')는 null이라 우연히 맞지 않는다.
const stripBase = (pathname) => {
  if (pathname === BASE_PATH) return '/';
  return pathname.startsWith(`${BASE_PATH}/`) ? pathname.slice(BASE_PATH.length) : null;
};

// 현재 경로(접두어 포함)에서 켤 메뉴 key. 표에 없는 경로는 null(AdminRoutes가 대시보드로 보낸다).
export const resolveViewKey = (pathname) => {
  const relative = stripBase(pathname);
  if (relative === null) return null;
  const route = ROUTE_TABLE.find((item) => matchPath({ path: item.path, end: true }, relative));
  return route ? (route.navKey ?? route.key) : null;
};

// params: 경로 파라미터(예: { userId }). search: 쿼리 문자열(예: '?page=2'). 돌려주는 pathname은 접두어를 포함한다.
export const buildLocation = (key, params, search) => {
  const route = ROUTE_TABLE.find((item) => item.key === key);
  return { pathname: route ? `${BASE_PATH}${generatePath(route.path, params)}` : HOME_PATH, search };
};
