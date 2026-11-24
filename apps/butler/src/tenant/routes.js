// 임차인 화면은 앱 안에서 /tenant 아래에 놓인다(관리자 /admin, 임대인 /landlord 와 겹치지 않게). 항상 앱 화면이라 web/app 으로 나누지 않는다.
export const BASE_PATH = '/tenant';
export const HOME_PATH = `${BASE_PATH}/home`;
export const TICKETS_PATH = `${BASE_PATH}/tickets`;
export const TICKET_NEW_PATH = `${TICKETS_PATH}/new`;
export const ticketPath = (ticketId) => `${TICKETS_PATH}/${encodeURIComponent(ticketId)}`;
export const ticketEditPath = (ticketId) => `${ticketPath(ticketId)}/edit`;
export const ticketSentPath = (ticketId) => `${ticketPath(ticketId)}/sent`;
export const SETTINGS_PATH = `${BASE_PATH}/settings`;
export const NOTIFICATIONS_PATH = `${BASE_PATH}/notifications`;
// 통합 검색(M13, #172). 검색어는 화면이 ?q= 로 남긴다.
export const SEARCH_PATH = `${BASE_PATH}/search`;
export const CONTRACTS_PATH = `${BASE_PATH}/contracts`;
export const contractPath = (contractId) => `${CONTRACTS_PATH}/${encodeURIComponent(contractId)}`;

// 알림 link('/tickets/:id')는 역할 접두어 없는 앱 경로다(계약 7장). 임차인 화면 주소로 바꾼다.
// 앱 밖 주소·'//'·임차인 앱에 없는 화면은 null(누르면 읽음만 하고 옮기지 않는다).
const TENANT_LINK_PREFIXES = ['/tickets/', '/contracts/'];
export const toTenantPath = (link) => {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) return null;
  return TENANT_LINK_PREFIXES.some((prefix) => link.startsWith(prefix)) ? `${BASE_PATH}${link}` : null;
};
