import { Button } from '@butler/ui';
import { Link2Off } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const AcceptedLinkScreen = ({ onLogin }) => (
  <InviteFrame center>
    <StatusBlock icon={Link2Off} title="이미 추가된 링크예요">
      이 링크의 계약은 이미 앱 계정에 추가됐어요.
      <br />
      추가한 계정으로 로그인해 확인해 주세요.
    </StatusBlock>
    <Button size="h52" className="mt-6 w-full" onClick={onLogin}>
      로그인
    </Button>
  </InviteFrame>
);
