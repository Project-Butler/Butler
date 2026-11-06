import { Button } from '@butler/ui';
import { ShieldAlert } from 'lucide-react';
import { useLogout } from './useLogout';

// API Role 은 ADMIN·LANDLORD·TENANT 셋뿐이지만, 모르는 역할이 오면 홈을 정할 수 없다.
// /login 으로 보내면 로그인 화면이 다시 역할 홈으로 보내 이동이 끝없이 반복되므로 안내와 로그아웃만 보여 준다.
export const UnsupportedAccount = () => {
  const logout = useLogout();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ground px-6 text-center font-sans">
      <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-white">
        <ShieldAlert size={24} />
      </span>
      <div>
        <h1 className="text-h2 font-bold text-ink">지원하지 않는 계정입니다</h1>
        <p className="mt-1 text-body text-ink-2">이 계정의 역할로는 사용할 수 있는 화면이 없습니다. 다른 계정으로 로그인해주세요.</p>
      </div>
      <Button variant="primary" onClick={logout}>
        로그아웃
      </Button>
    </div>
  );
};
