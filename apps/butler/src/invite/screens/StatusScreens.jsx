import { useState } from 'react';
import { Button } from '@butler/ui';
import { Check, CheckCheck, Link2Off, RefreshCw, ShieldAlert, UserX } from 'lucide-react';
import { InviteFrame, StatusBlock } from '../InviteFrame';

// 예외·완료 화면(시안 B2b · C3 · F1 · F2 · F3). 원인을 자세히 말하지 않는다(F1).

// F1 만료·취소·잘못된 링크(쓸 수 없는 초대)
export const UnusableScreen = () => (
  <InviteFrame center>
    <StatusBlock icon={Link2Off} title="쓸 수 없는 링크예요">
      기간이 지났거나 새 링크로 바뀌었어요.
      <br />
      임대인에게 새 링크를 요청해 주세요.
    </StatusBlock>
  </InviteFrame>
);

// F1 모양: 이미 수락된 링크를 로그인하지 않고 열었을 때. 추가한 계정으로 로그인하면 홈에서 볼 수 있다.
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

// F1 모양: 다른 임차인 계정이 이미 연결된 계약.
export const LinkedOtherScreen = () => (
  <InviteFrame center>
    <StatusBlock icon={Link2Off} title="쓸 수 없는 링크예요">
      이 계약은 이미 다른 계정과 연결돼 있어요.
      <br />
      임대인에게 확인해 주세요.
    </StatusBlock>
  </InviteFrame>
);

// F2 이미 추가한 계약(로그인한 임차인). 다른 계정이 수락했을 수도 있어서 내 계약에 없을 때의 안내를 함께 둔다.
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

// F3 임대인·관리자 계정으로 로그인됨. 계정당 역할 하나라 수락할 수 없다.
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

// B2b 하루 확인 한도. 횟수는 보여 주지 않는다. 공개 문의 폼은 후속이라 지금은 준비 중 안내만(결정 15).
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

// C3 추가 완료. C(로그인 후 추가)·D(가입하며 추가) 모두 여기로 모인다.
export const AddedScreen = ({ landlordName, onHome }) => (
  <InviteFrame top={null} center cta={<Button size="h52" className="w-full" onClick={onHome}>홈으로</Button>}>
    <StatusBlock icon={Check} tone="ok" size="lg" title="계약을 추가했어요">
      {landlordName ? `이제 ${landlordName} 님과 연결됐어요.` : '이제 임대인과 연결됐어요.'}
      <br />
      수리할 곳이 생기면 앱으로 알려 주세요.
    </StatusBlock>
  </InviteFrame>
);

// 일시 오류(요청 한도·네트워크). 다시 시도만 둔다.
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

export const LoadingScreen = () => (
  <InviteFrame center>
    <p role="status" className="text-body text-ink-3">
      불러오는 중이에요
    </p>
  </InviteFrame>
);
