import { matchPath } from 'react-router-dom';

// 메인 대시보드 경로. '/'로 들어오면 여기로 보낸다(App).
export const HOME_PATH = '/home';

// 화면 key ↔ URL 경로. 화면 컴포넌트는 onNavigate(key, params)로 이동하고, 이 파일이 key를 경로로 바꾼다.
// 위쪽일수록 먼저 맞춰 본다(/properties/new가 /properties/:propertyId보다 앞, /contracts/new도 같다).
export const ROUTE_TABLE = [
  { key: 'home', path: HOME_PATH },
  { key: 'buildingList', path: '/buildings' },
  { key: 'properties', path: '/properties' },
  { key: 'propertyRegister', path: '/properties/new' },
  { key: 'propertyDetail', path: '/properties/:propertyId' },
  { key: 'contracts', path: '/contracts' },
  { key: 'contractRegister', path: '/contracts/new' },
  { key: 'contractEdit', path: '/contracts/:contractId/edit' },
  { key: 'contractDetail', path: '/contracts/:contractId' },
  { key: 'setup', path: '/setup' },
  { key: 'disputes', path: '/disputes' },
  { key: 'disputeChat', path: '/disputes/chat' },
  { key: 'disputeSearch', path: '/disputes/search' },
  { key: 'disputeTopic', path: '/disputes/topics/:topicKey' },
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
  // 안내 문구(notice)는 주소에 남기지 않고 history state로만 넘긴다(새로고침하면 사라진다).
  buildingList: ({ notice }) => ({ pathname: '/buildings', state: notice ? { notice } : undefined }),
  // 소유 중(OWNER)이 기본이라 주소에는 다른 관계일 때만 붙인다.
  properties: ({ relation }) => ({
    pathname: '/properties',
    search: relation && relation !== 'OWNER' ? `?relation=${encodeURIComponent(relation)}` : '',
  }),
  propertyRegister: () => ({ pathname: '/properties/new' }),
  propertyDetail: ({ propertyId }) => ({ pathname: `/properties/${propertyId}` }),
  contracts: () => ({ pathname: '/contracts' }),
  // 사이드바 '계약' 메뉴 key(leases)도 계약 목록으로 보낸다.
  leases: () => ({ pathname: '/contracts' }),
  // 공실 호실에서 오면 propertyId, 갱신이면 renewFrom(이전 계약 id)을 주소에 남긴다(D-09·D-14).
  contractRegister: ({ propertyId, renewFrom } = {}) => {
    const search = new URLSearchParams(Object.entries({ propertyId, renewFrom }).filter(([, value]) => value)).toString();
    return { pathname: '/contracts/new', search: search ? `?${search}` : '' };
  },
  contractDetail: ({ contractId }) => ({ pathname: `/contracts/${contractId}` }),
  contractEdit: ({ contractId }) => ({ pathname: `/contracts/${contractId}/edit` }),
  setup: () => ({ pathname: '/setup' }),
  // 임대차 분쟁 센터 첫 화면(포털)
  disputes: () => ({ pathname: '/disputes' }),
  // 자료 찾기: 상황(topic)·검색어(q)·결과 탭(tab)을 주소에 남겨 사례 상세에서 돌아와도 그대로 보이게 한다.
  disputeSearch: ({ topic, q, tab } = {}) => {
    const search = new URLSearchParams(Object.entries({ topic, q, tab }).filter(([, value]) => value)).toString();
    return { pathname: '/disputes/search', search: search ? `?${search}` : '' };
  },
  // faq: 첫 화면 질문 칩에서 고른 자주 묻는 질문(상황 안내 맨 위에 펼친다)
  disputeTopic: ({ topicKey, faq }) => ({
    pathname: `/disputes/topics/${topicKey}`,
    search: faq ? `?faq=${encodeURIComponent(faq)}` : '',
  }),
  disputeReference: ({ referenceId }) => ({ pathname: `/disputes/references/${referenceId}` }),
  // 사례 상세에서 넘어온 질문(draft)은 setup의 notice처럼 history state로만 넘긴다.
  disputeChat: ({ draft }) => ({ pathname: '/disputes/chat', state: draft ? { draft } : undefined }),
};

export const buildLocation = (key, params = {}) => {
  const build = BUILDERS[key];
  return build ? build(params) : { pathname: `/${key}` };
};
