import { Button, Card } from '@butler/ui';

// 앱 화면의 내 정보 자리에 두는 계정 카드: 이름 · 이메일 · [로그아웃]. 로그아웃은 앱의 내 정보에만 둔다(임대인 앱·임차인 앱 공통).
export const AccountCard = ({ user, onLogout }) => (
  <Card>
    <p className="text-card-sm font-semibold text-ink">{user.name}</p>
    <p className="text-sub text-ink-3">{user.email}</p>
    <Button variant="secondary" className="mt-4 w-full" onClick={onLogout}>
      로그아웃
    </Button>
  </Card>
);
