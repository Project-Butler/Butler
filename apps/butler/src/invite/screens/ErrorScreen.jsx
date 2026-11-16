import { Button } from '@butler/ui';
import { RefreshCw } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const ErrorScreen = ({ message, onRetry }) => (
  <InviteFrame center>
    <StatusBlock icon={RefreshCw} title="잠시 후 다시 시도해 주세요">
      {message}
    </StatusBlock>
    <Button size="h52" variant="secondary" className="mt-6 w-full" onClick={onRetry}>
      다시 시도
    </Button>
  </InviteFrame>
);
