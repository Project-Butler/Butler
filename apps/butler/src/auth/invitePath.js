// 임차인 초대 주소(/invite/:token...). 로그인·가입 화면은 보이는 모양을 바꾸지 않고(결정 11),
// 돌아올 주소(from)가 초대 주소일 때 링크 대상·제출 값·소셜 시작 주소만 바꾼다. 그 판단을 여기 한 곳에 둔다.
export const INVITE_PREFIX = '/invite/';

export const invitePath = (token) => `${INVITE_PREFIX}${encodeURIComponent(token)}`;
export const inviteRegisterPath = (token) => `${invitePath(token)}/register`;

// 가입·소셜 가입을 마치고 돌아갈 주소. joined=1 이면 초대 화면이 "이미 수락됨" 응답을 완료 화면(C3)으로 읽는다.
export const inviteJoinedPath = (token) => `${invitePath(token)}?joined=1`;

// from 이 초대 주소면 토큰, 아니면 null. 토큰 조각은 base64url 이라 / ? # 가 들어가지 않는다.
export const getInviteTokenFromPath = (from) => {
  if (typeof from !== 'string' || !from.startsWith(INVITE_PREFIX)) return null;
  const segment = from.slice(INVITE_PREFIX.length).split(/[/?#]/)[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};
