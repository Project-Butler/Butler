import { matchPath } from 'react-router-dom';

// 메인 대시보드 경로. '/'로 들어오면 여기로 보낸다(App).
export const HOME_PATH = '/dashboard';

// 화면 key ↔ URL 경로. 화면 컴포넌트는 onNavigate(key, params)로 이동하고, 이 파일이 key를 경로로 바꾼다.
// 운영 API가 붙기 전인 메뉴(회원·소유 관계 등)도 경로는 미리 정해 두고, App이 '준비 중' 화면을 보여 준다.
export const ROUTE_TABLE = [
  { key: 'dashboard', path: HOME_PATH },
  { key: 'users', path: '/users' },
  { key: 'ownerships', path: '/ownerships' },
  { key: 'jobs', path: '/jobs' },
  { key: 'auditLogs', path: '/audit-logs' },
  { key: 'contracts', path: '/contracts' },
  { key: 'tickets', path: '/tickets' },
  { key: 'documents', path: '/documents' },
  { key: 'settings', path: '/settings' },
];

// 현재 경로가 어느 화면 key인지. 표에 없는 경로는 null(App이 대시보드로 보낸다).
export const resolveViewKey = (pathname) =>
  ROUTE_TABLE.find((route) => matchPath({ path: route.path, end: true }, pathname))?.key ?? null;

export const buildLocation = (key) => ({ pathname: ROUTE_TABLE.find((route) => route.key === key)?.path ?? HOME_PATH });
