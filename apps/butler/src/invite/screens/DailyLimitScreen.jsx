import { useState } from 'react';
import { Button } from '@butler/ui';
import { ShieldAlert } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

export const DailyLimitScreen = ({ onBack }) => {
  const [showNotice, setShowNotice] = useState(false);
  return (
    <InviteFrame
      top={{ title: '본인 확인', onBack }}
      center
      cta={
        <>
          {showNotice && (
            <p role="status" className="rounded-input bg-surface px-3 py-2.5 text-center text-m-sub text-ink-2">
              문의 접수는 준비 중이에요
            </p>
          )}
          <Button size="h52" className="w-full" onClick={() => setShowNotice(true)}>
            관리자에게 문의하기
          </Button>
          <p className="text-center text-m-sub text-ink-3">내일 다시 시도할 수도 있어요</p>
        </>
      }
    >
      <StatusBlock icon={ShieldAlert} title="오늘은 더 확인할 수 없어요">
        본인 확인을 여러 번 틀렸어요.
        <br />
        관리자에게 문의해 주세요.
      </StatusBlock>
    </InviteFrame>
  );
};
