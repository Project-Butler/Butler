// 임차인 화면은 앱 안에서 /tenant 아래에 놓인다(관리자 /admin, 임대인 /landlord 와 겹치지 않게). 항상 앱 화면이라 web/app 으로 나누지 않는다.
export const BASE_PATH = '/tenant';
export const HOME_PATH = `${BASE_PATH}/home`;
export const TICKETS_PATH = `${BASE_PATH}/tickets`;
export const SETTINGS_PATH = `${BASE_PATH}/settings`;
export const CONTRACTS_PATH = `${BASE_PATH}/contracts`;
export const contractPath = (contractId) => `${CONTRACTS_PATH}/${encodeURIComponent(contractId)}`;
