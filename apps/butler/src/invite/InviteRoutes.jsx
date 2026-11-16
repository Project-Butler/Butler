import { useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { GuestOnly } from '../auth/GuestOnly';
import { inviteJoinedPath, invitePath } from '../auth/invitePath';
import { OAuthSignupPage } from '../auth/OAuthSignupPage';
import { RegisterPage } from '../auth/RegisterPage';
import { useSessionStore } from '../store/sessionStore';
import { InvitePage } from './InvitePage';
import { useNoReferrer } from './useNoReferrer';

// 초대 가입 화면 앞의 문. 가입을 마치고(이 화면에서 로그인 상태가 되면) /invite/:token?joined=1 로 보내 C3 를 그리게 한다.
// 처음부터 로그인한 채 들어온 사람은 가입하지 않았으므로 joined 없이 /invite/:token 으로 보낸다
// (joined 를 붙이면 다른 사람이 수락한 초대에도 C3 '계약을 추가했어요'가 나온다).
const InviteGuestOnly = ({ token, children }) => {
  const [arrivedAsGuest] = useState(() => !useSessionStore.getState().user);
  return <GuestOnly from={arrivedAsGuest ? inviteJoinedPath(token) : invitePath(token)}>{children}</GuestOnly>;
};

// 공개 초대 경로(/invite/:token/*). 역할 폴더가 아니라 auth 처럼 공용이고, 항상 앱 모양이다(PC 에서도 가운데 모바일 폭).
//   /invite/:token                → InvitePage(로그인 여부와 관계없이 연다)
//   /invite/:token/register       → 기존 모바일 가입 화면 그대로 + invitationToken (InviteGuestOnly)
//   /invite/:token/register/oauth → 기존 모바일 소셜 가입 화면 그대로 (InviteGuestOnly, 초대는 서버 쿠키)
// 가입을 마치면 /invite/:token?joined=1 로 가고, 초대 화면이 C3(계약을 추가했어요)를 그린다.
export const InviteRoutes = () => {
  useNoReferrer();
  const { token } = useParams();

  return (
    <Routes>
      <Route index element={<InvitePage key={token} token={token} />} />
      <Route
        path="register"
        element={
          <InviteGuestOnly token={token}>
            <RegisterPage surface="app" invitationToken={token} />
          </InviteGuestOnly>
        }
      />
      <Route
        path="register/oauth"
        element={
          <InviteGuestOnly token={token}>
            <OAuthSignupPage surface="app" invitationToken={token} />
          </InviteGuestOnly>
        }
      />
      <Route path="*" element={<Navigate to={invitePath(token)} replace />} />
    </Routes>
  );
};
