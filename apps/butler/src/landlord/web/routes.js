import { matchPath } from 'react-router-dom';

// 임대인 화면은 앱 안에서 /landlord 아래에 놓인다(관리자 /admin, 임차인 /tenant와 겹치지 않게).
// 아래 ROUTE_TABLE·BUILDERS의 경로는 이 접두어 기준의 상대 경로이고, 접두어는 buildLocation·resolveViewKey가 붙이고 뗀다.
// <Routes>는 /landlord/* 안에서 접두어 없는 경로로 맞춘다.
export const BASE_PATH = '/landlord';
export const COMMUNITY_PATH = `${BASE_PATH}/community`;

// 메인 대시보드. '/landlord'로 들어오면 여기로 보낸다. Navigate에는 접두어를 포함한 HOME_PATH를 쓴다.
const HOME = '/home';
export const HOME_PATH = `${BASE_PATH}${HOME}`;

// 화면 key ↔ URL 경로. 화면 컴포넌트는 onNavigate(key, params)로 이동하고, 이 파일이 key를 경로로 바꾼다.
// 위쪽일수록 먼저 맞춰 본다(/properties/new가 /properties/:propertyId보다 앞, /contracts/new도 같다).
export const ROUTE_TABLE = [
  { key: 'home', path: HOME },
  { key: 'buildingList', path: '/buildings' },
  { key: 'properties', path: '/properties' },
  { key: 'propertyRegister', path: '/properties/new' },
  { key: 'propertyDetail', path: '/properties/:propertyId' },
  { key: 'propertyVerify', path: '/properties/:propertyId/verify' },
  { key: 'supportInquiry', path: '/support/inquiry' },
  { key: 'contracts', path: '/contracts' },
  { key: 'contractRegister', path: '/contracts/new' },
  { key: 'contractEdit', path: '/contracts/:contractId/edit' },
  { key: 'contractDetail', path: '/contracts/:contractId' },
  { key: 'logs', path: '/logs' },
  { key: 'logRegister', path: '/logs/new' },
  { key: 'logEdit', path: '/logs/:logId/edit' },
  { key: 'logDetail', path: '/logs/:logId' },
  { key: 'propertyLogRegister', path: '/properties/:propertyId/logs/new' },
  { key: 'setup', path: '/setup' },
  { key: 'disputes', path: '/disputes' },
  { key: 'disputeChat', path: '/disputes/chat' },
  { key: 'disputeSearch', path: '/disputes/search' },
  { key: 'disputeTopic', path: '/disputes/topics/:topicKey' },
  { key: 'disputeReference', path: '/disputes/references/:referenceId' },
];

// 접두어(/landlord)를 뗀다. /landlord 밖의 경로('/contracts', '/landlord-x/contracts')는 null이라 우연히 맞지 않는다.
const stripBase = (pathname) => {
  if (pathname === BASE_PATH) return '/';
  return pathname.startsWith(`${BASE_PATH}/`) ? pathname.slice(BASE_PATH.length) : null;
};

// 현재 경로(접두어 포함)가 어느 화면 key인지. 표에 없는 경로(아직 화면이 없는 메뉴)는 첫 구간을 key로 쓴다.
export const resolveViewKey = (pathname) => {
  const relative = stripBase(pathname);
  if (relative === null) return null;
  const matched = ROUTE_TABLE.find((route) => matchPath({ path: route.path, end: true }, relative));
  if (matched) return matched.key;
  return relative.split('/')[1] || 'home';
};

const BUILDERS = {
  home: () => ({ pathname: HOME }),
  // 안내 문구(notice)는 주소에 남기지 않고 history state로만 넘긴다(새로고침하면 사라진다).
  buildingList: ({ notice }) => ({ pathname: '/buildings', state: notice ? { notice } : undefined }),
  // 소유 중(OWNER)이 기본이라 주소에는 다른 관계일 때만 붙인다.
  properties: ({ relation }) => ({
    pathname: '/properties',
    search: relation && relation !== 'OWNER' ? `?relation=${encodeURIComponent(relation)}` : '',
  }),
  propertyRegister: () => ({ pathname: '/properties/new' }),
  // contractId: /contracts/:id 로 들어온 계약(호실 상세의 계약 영역에서 지난 계약이면 펼쳐 둔다)
  propertyDetail: ({ propertyId, contractId }) => ({ pathname: `/properties/${propertyId}`, search: contractId ? `?contract=${contractId}` : '' }),
  // 호실 상세 위 인증 팝업. 등록 직후 안내(notice)와 호실 상세에서 열었는지(fromDetail)는 history state로만 넘긴다.
  propertyVerify: ({ propertyId, notice, fromDetail }) => ({
    pathname: `/properties/${propertyId}/verify`,
    state: notice || fromDetail ? { ...(notice && { notice }), ...(fromDetail && { fromDetail }) } : undefined,
  }),
  supportInquiry: () => ({ pathname: '/support/inquiry' }),
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
  // 호실 필터(propertyId)는 주소에 남긴다. 사이드바 '관리 로그' 메뉴 key(log)도 목록으로 보낸다.
  logs: ({ propertyId } = {}) => ({ pathname: '/logs', search: propertyId ? `?propertyId=${propertyId}` : '' }),
  log: () => ({ pathname: '/logs' }),
  logRegister: () => ({ pathname: '/logs/new' }),
  logDetail: ({ logId }) => ({ pathname: `/logs/${logId}` }),
  logEdit: ({ logId }) => ({ pathname: `/logs/${logId}/edit` }),
  propertyLogRegister: ({ propertyId }) => ({ pathname: `/properties/${propertyId}/logs/new` }),
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

// 화면 key → 이동할 위치(접두어 포함). 표에 없는 key는 /landlord/{key}로 보낸다(아직 화면이 없는 메뉴).
export const buildLocation = (key, params = {}) => {
  const build = BUILDERS[key];
  const location = build ? build(params) : { pathname: `/${key}` };
  return { ...location, pathname: `${BASE_PATH}${location.pathname}` };
};
