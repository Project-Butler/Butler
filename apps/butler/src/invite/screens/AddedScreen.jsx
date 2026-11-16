import { Button } from '@butler/ui';
import { Check } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const AddedScreen = ({ landlordName, onHome }) => (
  <InviteFrame top={null} center cta={<Button size="h52" className="w-full" onClick={onHome}>홈으로</Button>}>
    <StatusBlock icon={Check} tone="ok" size="lg" title="계약을 추가했어요">
      {landlordName ? `이제 ${landlordName} 님과 연결됐어요.` : '이제 임대인과 연결됐어요.'}
      <br />
      수리할 곳이 생기면 앱으로 알려 주세요.
    </StatusBlock>
  </InviteFrame>
);
