import { generatePath, matchPath } from 'react-router-dom';

// 메인 대시보드 경로. '/'로 들어오면 여기로 보낸다(App).
export const HOME_PATH = '/dashboard';

// 화면 key ↔ URL 경로. 화면 컴포넌트는 onNavigate(key, params)로 이동하고, 이 파일이 key를 경로로 바꾼다.
// 운영 API가 붙기 전인 메뉴(계약 등)도 경로는 미리 정해 두고, App이 '준비 중' 화면을 보여 준다.
// navKey: 메뉴에 없는 하위 화면(상세)에서 켜 둘 메뉴 key.
export const ROUTE_TABLE = [
  { key: 'dashboard', path: HOME_PATH },
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

// 현재 경로에서 켤 메뉴 key. 표에 없는 경로는 null(App이 대시보드로 보낸다).
export const resolveViewKey = (pathname) => {
  const route = ROUTE_TABLE.find((item) => matchPath({ path: item.path, end: true }, pathname));
  return route ? (route.navKey ?? route.key) : null;
};

// params: 경로 파라미터(예: { userId }). search: 쿼리 문자열(예: '?page=2').
export const buildLocation = (key, params, search) => {
  const route = ROUTE_TABLE.find((item) => item.key === key);
  return { pathname: route ? generatePath(route.path, params) : HOME_PATH, search };
};
