// 임차인 앱 화면(항상 앱 셸). 셸·홈 자리·내 정보 자리는 8단계에서 만든다. 지금은 라우팅이 이어지는지만 확인하는 자리다.
export const TenantRoutes = ({ user, onLogout }) => (
  <main data-shell="tenant" className="p-6">
    <p>임차인 화면 준비 중 · {user.name}</p>
    <button type="button" onClick={onLogout}>로그아웃</button>
  </main>
);
