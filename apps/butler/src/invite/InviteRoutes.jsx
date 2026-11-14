import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { GuestOnly } from '../auth/GuestOnly';
import { inviteJoinedPath, invitePath } from '../auth/invitePath';
import { OAuthSignupPage } from '../auth/OAuthSignupPage';
import { RegisterPage } from '../auth/RegisterPage';
import { InvitePage } from './InvitePage';
import { useNoReferrer } from './useNoReferrer';

// 공개 초대 경로(/invite/:token/*). 역할 폴더가 아니라 auth 처럼 공용이고, 항상 앱 모양이다(PC 에서도 가운데 모바일 폭).
//   /invite/:token                → InvitePage(로그인 여부와 관계없이 연다)
//   /invite/:token/register       → 기존 모바일 가입 화면 그대로 + invitationToken (GuestOnly)
//   /invite/:token/register/oauth → 기존 모바일 소셜 가입 화면 그대로 (GuestOnly, 초대는 서버 쿠키)
// 가입을 마치면 GuestOnly 가 /invite/:token?joined=1 로 보내고, 초대 화면이 C3(계약을 추가했어요)를 그린다.
export const InviteRoutes = () => {
  useNoReferrer();
  const { token } = useParams();
  const joined = inviteJoinedPath(token);

  return (
    <Routes>
      <Route index element={<InvitePage key={token} token={token} />} />
      <Route
        path="register"
        element={
          <GuestOnly from={joined}>
            <RegisterPage surface="app" invitationToken={token} />
          </GuestOnly>
        }
      />
      <Route
        path="register/oauth"
        element={
          <GuestOnly from={joined}>
            <OAuthSignupPage surface="app" invitationToken={token} />
          </GuestOnly>
        }
      />
      <Route path="*" element={<Navigate to={invitePath(token)} replace />} />
    </Routes>
  );
};
