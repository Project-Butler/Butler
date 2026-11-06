// 역할 ↔ 주소 접두어·홈. 역할 폴더(admin·landlord·tenant)는 서로 import할 수 없어서
// 각 폴더의 HOME_PATH 와 같은 값을 여기에도 둔다. 어긋나지 않는지는 test/auth/roleHome.test.js 가 확인한다.
export const ROLE_PREFIX = { ADMIN: '/admin', LANDLORD: '/landlord', TENANT: '/tenant' };
const ROLE_HOME = { ADMIN: '/admin/dashboard', LANDLORD: '/landlord/home', TENANT: '/tenant/home' };

export const isKnownRole = (role) => Object.hasOwn(ROLE_PREFIX, role);

// 알 수 없는 역할은 null. /login 으로 보내면 로그인 화면이 다시 홈으로 보내 무한 반복되므로 호출부가 따로 처리한다.
export const getRoleHome = (role) => (isKnownRole(role) ? ROLE_HOME[role] : null);

const isInside = (path, prefix) => path === prefix || ['/', '?', '#'].some((separator) => path.startsWith(`${prefix}${separator}`));

// 로그인 뒤 돌아갈 주소(from). 내 역할 접두어로 시작할 때만 쓰고, 아니면 역할 홈으로 보낸다.
// from 은 location.state 에서 오지만 앱 밖 주소나 상위 경로 이동 조각이 섞이면 쓰지 않는다.
export const resolveAfterLogin = (from, role) => {
  const home = getRoleHome(role);
  if (home === null) return null;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return home;
  const pathOnly = from.split(/[?#]/)[0];
  // ../ 와 인코딩된 %2e%2e/ 모두 막는다.
  if (pathOnly.split('/').some((segment) => /^(\.|%2e){2}$/i.test(segment))) return home;
  return isInside(from, ROLE_PREFIX[role]) ? from : home;
};
