import { useState } from 'react';
import { Button, PageSkeleton } from '@butler/ui';
import { Phone, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { VerificationFailedNotice } from '../VerificationFailedNotice/VerificationFailedNotice';
import { usePostOwnershipVerification } from '../../hooks/usePostOwnershipVerification';
import { formatDateKST } from '../../utils/format';
import { requestOwnerIdentityVerification } from '../../utils/identityVerification';
import {
  getVerificationAction,
  RUNNER_UNAVAILABLE_CODE,
  VERIFICATION_CONSENT_ROWS,
  VERIFICATION_PREPARING_MESSAGE,
  VERIFICATION_REVOKED_CODE,
  VERIFICATION_REVOKED_MESSAGE,
  VERIFICATION_RUNNING_MESSAGE,
} from '../../utils/ownershipVerification';

const ConsentNotice = () => (
  <dl className="space-y-1.5 rounded-input bg-surface-2 p-4 text-sub text-ink-2">
    {VERIFICATION_CONSENT_ROWS.map(([term, description]) => (
      <div key={term} className="flex gap-2">
        <dt className="w-16 shrink-0 font-semibold text-ink">{term}</dt>
        <dd>{description}</dd>
      </div>
    ))}
  </dl>
);

// 권리자 인증 팝업(호실 상세 위). 개인정보 수집·이용 동의 → [나중에 하기]·[인증 시작]만 둔다.
// [인증 시작]을 누르면 본인인증 창을 먼저 열고, 본인인증을 마쳐야 권리자 인증을 요청한다.
// 인증 절차(단계·방식·소요 시간)는 화면에 보여 주지 않는다. 진행·완료·취소 상태는 문구와 버튼만 바뀐다.
// - ownership: 지금 소유 중인 소유 관계(없으면 isNotOwner), latest: useGetLatestOwnershipVerification 결과
export const VerifyModal = ({ propertyName, ownership, isNotOwner, latest, notice, onClose, onInquiry, onRegisterAnother, onRevoked, onUnauthorized }) => {
  const start = usePostOwnershipVerification({ onUnauthorized });
  const [isConsented, setIsConsented] = useState(false);
  // [임시·시연용] 테스트 모드: 본인인증은 하되 본인인증 인적사항과 회원 정보 대조를 건너뛴다. 운영 배포 전 제거.
  const [isTestMode, setIsTestMode] = useState(false);
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState(null);

  const action = ownership && getVerificationAction(ownership);
  const isDone = ownership && action === null && ownership.verificationStatus === 'VERIFIED';
  const isRunning = latest.isActive;
  const isBusy = isVerifyingIdentity || start.isLoading;
  const isReady = isConsented && !isBusy;
  const startError = start.error;
  const isPreparing = startError?.code === RUNNER_UNAVAILABLE_CODE;

  // 본인인증 → 권리자 인증 요청. 본인인증 인적사항은 서버가 포트원에서 직접 읽어 회원 정보와 비교한다.
  const handleStart = async () => {
    if (!isReady) return;
    setIdentityError(null);
    setIsVerifyingIdentity(true);
    const identity = await requestOwnerIdentityVerification();
    setIsVerifyingIdentity(false);
    if (identity.error) {
      setIdentityError(identity.error);
      return;
    }

    setIsConsented(false);
    const { data, error } = await start.startVerification({
      ownershipId: ownership.id,
      consent: true,
      identityVerificationId: identity.identityVerificationId,
      testMode: isTestMode,
    });
    if (data) {
      latest.trackAttempt(data);
      return;
    }
    if (error?.code === VERIFICATION_REVOKED_CODE) onRevoked();
  };

  const closeButton = (label = '닫기') => (
    <Button variant="secondary" size="h44" onClick={onClose}>
      {label}
    </Button>
  );

  let view;
  if (isNotOwner) {
    view = { icon: Shield, tone: 'mute', body: <NoticeBox>지금 소유 중인 호실만 인증할 수 있어요.</NoticeBox>, footer: closeButton() };
  } else if (!ownership || (latest.isLoading && !latest.data)) {
    view = { icon: Shield, tone: 'seal', body: <PageSkeleton variant="text" rows={3} />, footer: closeButton() };
  } else if (isRunning) {
    view = {
      icon: Shield,
      tone: 'seal',
      title: '소유자 정보를 확인하고 있어요',
      body: (
        <div className="space-y-3">
          <NoticeBox tone="seal">{VERIFICATION_RUNNING_MESSAGE}</NoticeBox>
          <p role="status" className="text-sub text-ink-2">
            창을 닫아도 확인은 계속돼요. 끝나면 호실 상세의 권리자 인증 카드에서 결과를 볼 수 있어요.
          </p>
        </div>
      ),
      footer: closeButton(),
    };
  } else if (isDone) {
    view = {
      icon: ShieldCheck,
      tone: 'seal',
      title: '권리자 인증을 마쳤어요',
      body: (
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
      ),
      footer: (
        <>
          <Button variant="secondary" size="h44" onClick={onRegisterAnother}>
            다른 호실 등록
          </Button>
          <Button size="h44" onClick={onClose}>
            확인
          </Button>
        </>
      ),
    };
  } else if (action === 'INQUIRY') {
    view = {
      icon: ShieldAlert,
      tone: 'crit',
      title: '권리자 인증 취소',
      body: <NoticeBox>{VERIFICATION_REVOKED_MESSAGE}</NoticeBox>,
      footer: (
        <>
          {closeButton()}
          <Button size="h44" onClick={onInquiry}>
            <Phone size={15} className="-ml-0.5 mr-1.5 inline-block" />
            문의하기
          </Button>
        </>
      ),
    };
  } else {
    view = {
      icon: action === 'RENEW' ? ShieldAlert : Shield,
      tone: 'seal',
      title: action === 'RENEW' ? '권리자 재인증' : '권리자 인증',
      body: (
        <div className="space-y-4">
          {latest.data?.status === 'FAILED' && !startError && !identityError && <VerificationFailedNotice onInquiry={onInquiry} />}
          <p className="text-label font-semibold text-ink">개인정보 수집·이용 동의</p>
          <ConsentNotice />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              className="accent-accent"
              checked={isConsented}
              onChange={(event) => setIsConsented(event.target.checked)}
              disabled={isBusy}
            />
            개인정보 수집·이용에 동의해요
          </label>
          {/* [임시·시연용] 테스트 모드 토글. 운영 배포 전 제거. */}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-ink-2">
            <input
              type="checkbox"
              className="accent-accent"
              checked={isTestMode}
              onChange={(event) => setIsTestMode(event.target.checked)}
              disabled={isBusy}
            />
            테스트 모드 (본인인증 인적사항 대조 건너뛰기)
          </label>
          <p className="text-sub text-ink-3">인증 시작을 누르면 본인인증 창이 열려요. 본인인증을 마쳐야 권리자 인증이 진행돼요.</p>
          {identityError && <NoticeBox>{identityError.message}</NoticeBox>}
          {isPreparing && <NoticeBox tone="seal">{VERIFICATION_PREPARING_MESSAGE}</NoticeBox>}
          {startError && !isPreparing && !identityError && <NoticeBox>{startError.message}</NoticeBox>}
        </div>
      ),
      footer: (
        <>
          <Button variant="secondary" size="h44" onClick={onClose} disabled={isBusy}>
            나중에 하기
          </Button>
          <Button variant="verify" size="h44" onClick={handleStart} disabled={!isReady}>
            {isVerifyingIdentity ? '본인인증 중' : start.isLoading ? '시작하는 중' : '인증 시작'}
          </Button>
        </>
      ),
    };
  }

  return (
    <Modal title={view.title ?? '권리자 인증'} subtitle={propertyName} icon={view.icon} iconTone={view.tone} onClose={onClose} footer={view.footer}>
      <div className="space-y-4">
        {notice && <NoticeBox tone="info">{notice}</NoticeBox>}
        {latest.error && <NoticeBox>{latest.error.message}</NoticeBox>}
        {view.body}
      </div>
    </Modal>
  );
};
