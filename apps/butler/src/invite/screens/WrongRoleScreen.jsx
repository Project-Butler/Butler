import { Button } from '@butler/ui';
import { UserX } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const WrongRoleScreen = ({ onLogout, busy }) => (
  <InviteFrame center>
    <StatusBlock icon={UserX} tone="seal" title="임차인 계정이 필요해요">
      지금은 임대인 계정으로 로그인돼 있어요.
      <br />
      로그아웃한 뒤 임차인 계정으로 다시 열어 주세요.
    </StatusBlock>
    <Button size="h52" className="mt-6 w-full" onClick={onLogout} disabled={busy}>
      로그아웃하고 계속
    </Button>
  </InviteFrame>
);
