import { Link2Off } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const UnusableScreen = () => (
  <InviteFrame center>
    <StatusBlock icon={Link2Off} title="쓸 수 없는 링크예요">
      기간이 지났거나 새 링크로 바뀌었어요.
      <br />
      임대인에게 새 링크를 요청해 주세요.
    </StatusBlock>
  </InviteFrame>
);
