import { Button } from '@butler/ui';
import { CheckCheck } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const AlreadyAddedScreen = ({ onHome }) => (
  <InviteFrame center>
    <StatusBlock icon={CheckCheck} tone="ok" title="이미 추가한 계약이에요">
      이 링크의 계약이 내 계약에 있어요.
      <br />
      내 계약에 보이지 않으면 임대인에게 새 링크를 요청해 주세요.
    </StatusBlock>
    <Button size="h52" className="mt-6 w-full" onClick={onHome}>
      내 계약 보기
    </Button>
  </InviteFrame>
);
