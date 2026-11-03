import { useCallback, useState } from 'react';
import { Button, Card } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { VerificationFailedNotice } from '../components/VerificationFailedNotice/VerificationFailedNotice';
import { useGetLatestOwnershipVerification } from '../hooks/useGetLatestOwnershipVerification';
import { useGetProperty } from '../hooks/useGetProperty';
import { useGetPropertyOwnership } from '../hooks/useGetPropertyOwnership';
import { usePostOwnershipVerification } from '../hooks/usePostOwnershipVerification';
import { formatDateKST } from '../utils/format';
import {
  getVerificationAction,
  RUNNER_UNAVAILABLE_CODE,
  VERIFICATION_PREPARING_MESSAGE,
  VERIFICATION_REVOKED_CODE,
  VERIFICATION_REVOKED_MESSAGE,
  VERIFICATION_RUNNING_MESSAGE,
} from '../utils/ownershipVerification';

const ConsentNotice = () => (
  <dl className="space-y-1.5 rounded-input bg-surface-2 p-4 text-sub text-ink-2">
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-ink">수집 항목</dt>
      <dd>회원 정보의 이름·생년월일, 건축물대장의 소유자 정보</dd>
    </div>
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-ink">이용 목적</dt>
      <dd>회원 정보와 건축물대장의 소유자 정보를 비교해 권리자를 확인해요.</dd>
    </div>
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-ink">보유 기간</dt>
      <dd>건축물대장의 소유자 정보는 비교가 끝나면 바로 파기해요. 회원 정보는 따로 저장하지 않고 비교에만 써요.</dd>
    </div>
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-ink">거부 권리</dt>
      <dd>동의하지 않을 수 있지만, 동의하지 않으면 인증을 진행할 수 없어요.</dd>
    </div>
  </dl>
);

const VerificationForm = ({ ownership, isRenewal, hasFailed, onStarted, onRevoked, onLater, onInquiry, onUnauthorized }) => {
  const start = usePostOwnershipVerification({ onUnauthorized });
  const [isConsented, setIsConsented] = useState(false);
  const isReady = isConsented && !start.isLoading;

  // 이름·생년월일은 회원 정보를 쓰므로 동의만 받고 바로 시작한다.
  const handleStart = async () => {
    if (!isReady) return;
    setIsConsented(false);
    const { data, error } = await start.startVerification({ ownershipId: ownership.id, consent: true });
    if (data) {
      onStarted(data);
      return;
    }
    if (error?.code === VERIFICATION_REVOKED_CODE) onRevoked();
  };

  const startError = start.error;
  const isPreparing = startError?.code === RUNNER_UNAVAILABLE_CODE;

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-section font-semibold text-ink">{isRenewal ? '권리자 재인증' : '권리자 인증'}</h2>
        <p className="text-sub text-ink-2">가입할 때 적은 이름과 생년월일을 건축물대장의 소유자 정보와 비교해요.</p>
      </div>

      {hasFailed && !startError && <VerificationFailedNotice onInquiry={onInquiry} />}

      <div className="space-y-3">
        <p className="text-label font-semibold text-ink">개인정보 수집·이용 동의</p>
        <ConsentNotice />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-ink">
          <input
            type="checkbox"
            className="accent-accent"
            checked={isConsented}
            onChange={(event) => setIsConsented(event.target.checked)}
            disabled={start.isLoading}
          />
          개인정보 수집·이용에 동의해요
        </label>
      </div>

      {isPreparing && <NoticeBox tone="seal">{VERIFICATION_PREPARING_MESSAGE}</NoticeBox>}
      {startError && !isPreparing && <NoticeBox>{startError.message}</NoticeBox>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onLater} disabled={start.isLoading}>
          나중에 하기
        </Button>
        <Button variant="verify" onClick={handleStart} disabled={!isReady}>
          {start.isLoading ? '시작하는 중' : '인증 시작'}
        </Button>
      </div>
    </Card>
  );
};

// 권리자 인증(/properties/:propertyId/verify). 호실 등록 직후·호실 상세·재인증 안내에서 들어온다.
export const PropertyVerifyPage = ({ propertyId, notice, onVerified, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const propertyQuery = useGetProperty(propertyId, hookOptions);
  const property = propertyQuery.data;
  const ownershipId = property?.myRelation?.type === 'OWNER' ? property.myRelation.ownershipId : undefined;
  const ownershipQuery = useGetPropertyOwnership(ownershipId, hookOptions);
  const ownership = ownershipQuery.data;
  const [finishedAttempt, setFinishedAttempt] = useState(null);
  const refetchOwnership = ownershipQuery.refetch;

  const handleFinished = useCallback(
    (attempt) => {
      setFinishedAttempt(attempt);
      refetchOwnership();
      if (attempt.status === 'VERIFIED') onVerified?.();
    },
    [refetchOwnership, onVerified],
  );
  const latest = useGetLatestOwnershipVerification(ownershipId, { onFinished: handleFinished, onUnauthorized });

  const goInquiry = () => onNavigate('supportInquiry');
  const goDetail = () => onNavigate('propertyDetail', { propertyId });
  const goLater = () => onNavigate('buildingList', notice ? { notice } : {});

  const header = (
    <PageHeader title="권리자 인증" description={property?.displayName} onBack={() => window.history.back()} />
  );
  const pageError = propertyQuery.error ?? ownershipQuery.error;
  const isNotOwner = property && !ownershipId;

  if (pageError || isNotOwner || !ownership || (latest.isLoading && !latest.data)) {
    return (
      <div className="w-full max-w-2xl space-y-6 pb-10">
        {header}
        {pageError && <NoticeBox>{pageError.message}</NoticeBox>}
        {isNotOwner && <NoticeBox>지금 소유 중인 호실만 인증할 수 있어요.</NoticeBox>}
        {!pageError && !isNotOwner && <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      </div>
    );
  }

  const action = getVerificationAction(ownership);
  const isDone = finishedAttempt?.status === 'VERIFIED' || (action === null && ownership.verificationStatus === 'VERIFIED');

  let content;
  if (latest.isActive) {
    content = (
      <Card className="space-y-4 p-6">
        <h2 className="text-section font-semibold text-ink">소유자 정보를 확인하고 있어요</h2>
        <NoticeBox tone="seal">{VERIFICATION_RUNNING_MESSAGE}</NoticeBox>
        <p role="status" className="text-sub text-ink-2">
          확인이 끝나면 호실 상세에서도 결과를 볼 수 있어요.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={goDetail}>
            호실 상세로
          </Button>
        </div>
      </Card>
    );
  } else if (isDone) {
    content = (
      <Card className="space-y-4 p-6">
        <h2 className="text-section font-semibold text-seal-ink">권리자 인증을 마쳤어요</h2>
        <dl className="space-y-2 text-body">
          <div className="flex gap-4">
            <dt className="w-24 text-ink-3">인증일</dt>
            <dd className="font-num tabular-nums text-seal-ink">{formatDateKST(ownership.verifiedAt) ?? '—'}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 text-ink-3">인증 만료일</dt>
            <dd className="font-num tabular-nums text-seal-ink">{formatDateKST(ownership.verificationExpiresAt) ?? '—'}</dd>
          </div>
        </dl>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onNavigate('propertyRegister')}>
            다른 호실 등록
          </Button>
          <Button onClick={goDetail}>호실 상세로</Button>
        </div>
      </Card>
    );
  } else if (action === 'INQUIRY') {
    content = (
      <Card className="space-y-4 p-6">
        <NoticeBox>{VERIFICATION_REVOKED_MESSAGE}</NoticeBox>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={goDetail}>
            호실 상세로
          </Button>
          <Button onClick={goInquiry}>문의하기</Button>
        </div>
      </Card>
    );
  } else {
    content = (
      <VerificationForm
        ownership={ownership}
        isRenewal={action === 'RENEW'}
        hasFailed={latest.data?.status === 'FAILED'}
        onStarted={latest.trackAttempt}
        onRevoked={refetchOwnership}
        onLater={goLater}
        onInquiry={goInquiry}
        onUnauthorized={onUnauthorized}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6 pb-10">
      {header}
      {notice && <NoticeBox tone="info">{notice}</NoticeBox>}
      {latest.error && <NoticeBox>{latest.error.message}</NoticeBox>}
      {content}
    </div>
  );
};
