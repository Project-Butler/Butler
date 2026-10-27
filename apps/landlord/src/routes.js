import { matchPath } from 'react-router-dom';

// 메인 대시보드 경로. '/'로 들어오면 여기로 보낸다(App).
export const HOME_PATH = '/home';

// 화면 key ↔ URL 경로. 화면 컴포넌트는 onNavigate(key, params)로 이동하고, 이 파일이 key를 경로로 바꾼다.
// 위쪽일수록 먼저 맞춰 본다(/buildings/new가 /buildings/:landlordBuildingId보다 앞).
export const ROUTE_TABLE = [
  { key: 'home', path: HOME_PATH },
  { key: 'buildingList', path: '/buildings' },
  { key: 'buildingRegister', path: '/buildings/new' },
  { key: 'buildingEdit', path: '/buildings/:landlordBuildingId/edit' },
  { key: 'buildingDetail', path: '/buildings/:landlordBuildingId' },
  { key: 'properties', path: '/properties' },
  { key: 'propertyRegister', path: '/properties/new' },
  { key: 'propertyDetail', path: '/properties/:propertyId' },
  { key: 'setup', path: '/setup' },
  { key: 'disputes', path: '/disputes' },
  { key: 'disputeChat', path: '/disputes/chat' },
  { key: 'disputeReference', path: '/disputes/references/:referenceId' },
];

// 현재 경로가 어느 화면 key인지. 표에 없는 경로(아직 화면이 없는 메뉴)는 첫 구간을 key로 쓴다.
export const resolveViewKey = (pathname) => {
  const matched = ROUTE_TABLE.find((route) => matchPath({ path: route.path, end: true }, pathname));
  if (matched) return matched.key;
  return pathname.split('/')[1] || 'home';
};

const BUILDERS = {
  home: () => ({ pathname: HOME_PATH }),
  buildingList: () => ({ pathname: '/buildings' }),
  buildingRegister: () => ({ pathname: '/buildings/new' }),
  buildingDetail: ({ landlordBuildingId }) => ({ pathname: `/buildings/${landlordBuildingId}` }),
  buildingEdit: ({ landlordBuildingId }) => ({ pathname: `/buildings/${landlordBuildingId}/edit` }),
  // 소유 중(OWNER)이 기본이라 주소에는 다른 관계일 때만 붙인다.
  properties: ({ relation }) => ({
    pathname: '/properties',
    search: relation && relation !== 'OWNER' ? `?relation=${encodeURIComponent(relation)}` : '',
  }),
  propertyRegister: ({ complexId }) => ({
    pathname: '/properties/new',
    search: complexId ? `?complexId=${encodeURIComponent(complexId)}` : '',
  }),
  propertyDetail: ({ propertyId }) => ({ pathname: `/properties/${propertyId}` }),
  // 안내 문구(notice)는 주소에 남기지 않고 history state로만 넘긴다(새로고침하면 사라진다).
  setup: ({ notice }) => ({ pathname: '/setup', state: notice ? { notice } : undefined }),
  // 상황(topic)·검색어(q)·결과 탭(tab)을 주소에 남겨 사례 상세에서 돌아와도 그대로 보이게 한다.
  disputes: ({ topic, q, tab } = {}) => {
    const search = new URLSearchParams(Object.entries({ topic, q, tab }).filter(([, value]) => value)).toString();
    return { pathname: '/disputes', search: search ? `?${search}` : '' };
  },
  disputeReference: ({ referenceId }) => ({ pathname: `/disputes/references/${referenceId}` }),
  // 사례 상세에서 넘어온 질문(draft)은 setup의 notice처럼 history state로만 넘긴다.
  disputeChat: ({ draft }) => ({ pathname: '/disputes/chat', state: draft ? { draft } : undefined }),
};

export const buildLocation = (key, params = {}) => {
  const build = BUILDERS[key];
  return build ? build(params) : { pathname: `/${key}` };
};
