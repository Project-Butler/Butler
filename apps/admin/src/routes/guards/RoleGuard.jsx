import { Button } from '@butler/ui';
import { ShieldAlert } from 'lucide-react';

// 역할별 접근 제한(frontend-structure.md). 백엔드 /admin 라우터의 roleGuard(['ADMIN'])와 범위를 맞춘다.
// role은 GET /auth/me의 user.role(대문자)로 비교한다. 다른 역할 계정으로 로그인했으면 안내와 로그아웃만 보여 준다.
export const RoleGuard = ({ user, allowedRoles, onLogout, children }) => {
  if (allowedRoles.includes(user?.role)) return children;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ground px-6 text-center font-sans">
      <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-white">
        <ShieldAlert size={24} />
      </span>
      <div>
        <h1 className="text-h2 font-bold text-ink">관리자 계정이 아닙니다</h1>
        <p className="mt-1 text-body text-ink-2">관리자 콘솔은 운영자 계정으로만 이용할 수 있습니다.</p>
      </div>
      <Button variant="primary" onClick={onLogout}>
        다른 계정으로 로그인
      </Button>
    </div>
  );
};
