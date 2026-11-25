// 버튼 글자 — 앱 머리(app CommunityAppHeader)도 같은 글자를 쓴다
export const nicknameButtonText = (nickname) => (nickname ? `닉네임 · ${nickname}` : '닉네임 정하기');

// 머리(PageHeader actions) 맨 왼쪽의 작은 글자 버튼(PC 명세 1절 v3): "닉네임 · {내 닉네임}", 없으면 "닉네임 정하기".
export const NicknameButton = ({ nickname, onClick }) => (
  <button type="button" onClick={onClick} className="whitespace-nowrap text-sub text-ink-2 hover:text-ink">
    {nicknameButtonText(nickname)}
  </button>
);
