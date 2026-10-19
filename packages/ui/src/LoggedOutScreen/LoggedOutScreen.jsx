import { Home } from 'lucide-react';
import { Button } from '../Button/Button';

export const LoggedOutScreen = ({ brand = 'Butler', onReturn }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ground px-6 text-center font-sans">
      <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-white">
        <Home size={22} strokeWidth={2.25} />
      </span>
      <div>
        <p className="text-section font-bold text-seal-ink">{brand}</p>
        <p className="mt-1 text-body text-ink-2">로그아웃되었습니다. 다시 로그인해 주세요.</p>
        <p className="mt-1 text-chip text-ink-3">(로그인 화면은 별도 작업에서 구현됩니다)</p>
      </div>
      {onReturn && (
        <Button variant="secondary" size="sm" onClick={onReturn} className="mt-2">
          데모용 — 다시 들어가기
        </Button>
      )}
    </div>
  );
};
