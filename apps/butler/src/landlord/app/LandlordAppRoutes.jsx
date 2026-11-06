// 임대인 앱 화면(상단 바 + 하단 탭). 앱 셸과 "준비 중" 화면은 7단계에서 만든다. 지금은 라우팅이 이어지는지만 확인하는 자리다.
export const LandlordAppRoutes = ({ user, onLogout }) => (
  <main data-shell="landlord-app" className="p-6">
    <p>임대인 앱 화면 준비 중 · {user.name}</p>
    <button type="button" onClick={onLogout}>로그아웃</button>
  </main>
);
