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
  { key: 'contractInvite', path: '/contracts/:contractId/invite' },
  { key: 'contractDetail', path: '/contracts/:contractId' },
  { key: 'logs', path: '/logs' },
  { key: 'logRegister', path: '/logs/new' },
  { key: 'logEdit', path: '/logs/:logId/edit' },
  { key: 'logDetail', path: '/logs/:logId' },
  { key: 'propertyLogRegister', path: '/properties/:propertyId/logs/new' },
  { key: 'documents', path: '/documents' },
  { key: 'tickets', path: '/tickets' },
  { key: 'ticketRegister', path: '/tickets/new' },
  { key: 'ticketDetail', path: '/tickets/:ticketId' },
  { key: 'thread', path: '/threads/:threadId' },
  { key: 'setup', path: '/setup' },
  { key: 'schedules', path: '/schedules' },
  { key: 'search', path: '/search' },
  { key: 'settings', path: '/settings' },
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
  // inviteContractId: 방금 등록한 계약. 호실 상세가 임차인 초대 팝업을 한 번 띄운다(history state로만, 새로고침·뒤로가기로 다시 뜨지 않게 화면이 지운다).
  propertyDetail: ({ propertyId, contractId, inviteContractId }) => ({
    pathname: `/properties/${propertyId}`,
    search: contractId ? `?contract=${contractId}` : '',
    state: inviteContractId ? { inviteContractId } : undefined,
  }),
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
  // 임차인 초대(앱 M15). 웹은 이 주소로 오면 그 계약의 호실 상세로 보내 초대 팝업을 띄운다.
  contractInvite: ({ contractId }) => ({ pathname: `/contracts/${contractId}/invite` }),
  // 호실 필터(propertyId)는 주소에 남긴다. 사이드바 '관리 로그' 메뉴 key(log)도 목록으로 보낸다.
  logs: ({ propertyId } = {}) => ({ pathname: '/logs', search: propertyId ? `?propertyId=${propertyId}` : '' }),
  log: () => ({ pathname: '/logs' }),
  // 기록 추가·수정은 목록·호실 상세 위 팝업. 호실 필터(propertyId)는 주소에 남기고, 화면에서 열었는지(fromPage)는 history state로만.
  logRegister: ({ propertyId, fromPage } = {}) => ({
    pathname: '/logs/new',
    search: propertyId ? `?propertyId=${propertyId}` : '',
    state: fromPage ? { fromPage } : undefined,
  }),
  logDetail: ({ logId }) => ({ pathname: `/logs/${logId}` }),
  logEdit: ({ logId, propertyId, fromPage }) => ({
    pathname: `/logs/${logId}/edit`,
    search: propertyId ? `?propertyId=${propertyId}` : '',
    state: fromPage ? { fromPage } : undefined,
  }),
  propertyLogRegister: ({ propertyId, fromPage }) => ({
    pathname: `/properties/${propertyId}/logs/new`,
    state: fromPage ? { fromPage } : undefined,
  }),
  // 서류함. 고른 호실(propertyId)은 주소에 남긴다. 없으면 화면이 첫 호실을 골라 주소를 바꾼다.
  // type: 앱 문서함(M11)의 종류 목록('all'·'contract' 등). 웹 문서함은 쓰지 않는다.
  documents: ({ propertyId, type } = {}) => {
    const search = new URLSearchParams(Object.entries({ propertyId, type }).filter(([, value]) => value)).toString();
    return { pathname: '/documents', search: search ? `?${search}` : '' };
  },
  // 수리·점검(M09). 호실 필터(propertyId)는 주소에 남긴다. 등록 화면도 호실에서 오면 그 호실을 미리 고른다.
  tickets: ({ propertyId } = {}) => ({ pathname: '/tickets', search: propertyId ? `?propertyId=${propertyId}` : '' }),
  ticketRegister: ({ propertyId } = {}) => ({ pathname: '/tickets/new', search: propertyId ? `?propertyId=${propertyId}` : '' }),
  // complete: 목록의 [완료 처리]로 들어와 완료 시트를 바로 연다(history state 로만 넘긴다).
  ticketDetail: ({ ticketId, complete }) => ({ pathname: `/tickets/${ticketId}`, state: complete ? { complete: true } : undefined }),
  // 소통(M10) 대화방
  thread: ({ threadId }) => ({ pathname: `/threads/${threadId}` }),
  setup: () => ({ pathname: '/setup' }),
  // 일정·알림(임대인 앱). 알림 탭이면 ?tab=notifications 를 주소에 남긴다(새로고침·뒤로 가기에도 같은 탭).
  // 통합 검색(M13, #172). 검색어는 화면이 ?q= 로 남긴다.
  search: () => ({ pathname: '/search' }),
  // 화면 설정(테마·밀도·사이드바·글자 크기, #176). 좌측 하단 설정 메뉴가 연다.
  settings: () => ({ pathname: '/settings' }),
  schedules: ({ tab } = {}) => ({ pathname: '/schedules', search: tab === 'notifications' ? '?tab=notifications' : '' }),
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

// 같은 화면 안에서 주소만 바뀌는 묶음(팝업·패널·내부 탭). 묶음이 같으면 화면을 다시 만들지 않고 그대로 갱신한다.
// 묶음이 바뀌어야(다른 메뉴·다른 호실로 이동) 새 화면을 준비하는 동안 지금 화면을 둔다(ReadyGate).
const PAGE_GROUP_BY_VIEW = {
  propertyDetail: 'property',
  propertyVerify: 'property',
  propertyLogRegister: 'property',
  logs: 'logs',
  logRegister: 'logs',
  logEdit: 'logs',
  logDetail: 'logs',
  disputes: 'disputes',
  disputeSearch: 'disputes',
  disputeTopic: 'disputes',
  disputeReference: 'disputes',
};

export const resolvePageGroup = (pathname) => {
  const viewKey = resolveViewKey(pathname);
  const group = PAGE_GROUP_BY_VIEW[viewKey] ?? viewKey;
  if (group !== 'property') return group;
  const relative = stripBase(pathname) ?? pathname;
  return `property:${matchPath({ path: '/properties/:propertyId/*', end: false }, relative)?.params.propertyId}`;
};
