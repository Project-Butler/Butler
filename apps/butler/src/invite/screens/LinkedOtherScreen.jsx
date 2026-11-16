import { Link2Off } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const LinkedOtherScreen = () => (
  <InviteFrame center>
    <StatusBlock icon={Link2Off} title="쓸 수 없는 링크예요">
      이 계약은 이미 다른 계정과 연결돼 있어요.
      <br />
      임대인에게 확인해 주세요.
    </StatusBlock>
  </InviteFrame>
);
