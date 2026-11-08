import { useState } from 'react';
import { Button } from '@butler/ui';
import { Phone, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Modal } from '../Modal/Modal';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { VerificationFailedNotice } from '../VerificationFailedNotice/VerificationFailedNotice';
import { usePostOwnershipVerification } from '../../hooks/usePostOwnershipVerification';
import { formatDateKST } from '../../utils/format';
import {
  getVerificationAction,
  RUNNER_UNAVAILABLE_CODE,
  VERIFICATION_PREPARING_MESSAGE,
  VERIFICATION_REVOKED_CODE,
  VERIFICATION_REVOKED_MESSAGE,
  VERIFICATION_RUNNING_MESSAGE,
} from '../../utils/ownershipVerification';

const CONSENT_ROWS = [
  ['수집 항목', '회원 정보의 이름·생년월일, 건축물대장의 소유자 정보'],
  ['이용 목적', '회원 정보와 건축물대장의 소유자 정보를 비교해 권리자를 확인해요.'],
  ['보유 기간', '건축물대장의 소유자 정보는 비교가 끝나면 바로 파기해요. 회원 정보는 따로 저장하지 않고 비교에만 써요.'],
  ['거부 권리', '동의하지 않을 수 있지만, 동의하지 않으면 인증을 진행할 수 없어요.'],
];

const ConsentNotice = () => (
  <dl className="space-y-1.5 rounded-input bg-surface-2 p-4 text-sub text-ink-2">
    {CONSENT_ROWS.map(([term, description]) => (
      <div key={term} className="flex gap-2">
        <dt className="w-16 shrink-0 font-semibold text-ink">{term}</dt>
        <dd>{description}</dd>
      </div>
    ))}
  </dl>
);

// 권리자 인증 팝업(호실 상세 위). 개인정보 수집·이용 동의 → [나중에 하기]·[인증 시작]만 둔다.
// 인증 절차(단계·방식·소요 시간)는 화면에 보여 주지 않는다. 진행·완료·취소 상태는 문구와 버튼만 바뀐다.
// - ownership: 지금 소유 중인 소유 관계(없으면 isNotOwner), latest: useGetLatestOwnershipVerification 결과
export const VerifyModal = ({ propertyName, ownership, isNotOwner, latest, notice, onClose, onInquiry, onRegisterAnother, onRevoked, onUnauthorized }) => {
  const start = usePostOwnershipVerification({ onUnauthorized });
  const [isConsented, setIsConsented] = useState(false);

  const action = ownership && getVerificationAction(ownership);
  const isDone = ownership && action === null && ownership.verificationStatus === 'VERIFIED';
  const isRunning = latest.isActive;
  const isReady = isConsented && !start.isLoading;
  const startError = start.error;
  const isPreparing = startError?.code === RUNNER_UNAVAILABLE_CODE;

  // 이름·생년월일은 회원 정보를 쓰므로 동의만 받고 바로 시작한다.
  const handleStart = async () => {
    if (!isReady) return;
    setIsConsented(false);
    const { data, error } = await start.startVerification({ ownershipId: ownership.id, consent: true });
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
    view = { icon: Shield, tone: 'seal', body: <p className="py-6 text-center text-body text-ink-3">불러오는 중입니다</p>, footer: closeButton() };
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
          {latest.data?.status === 'FAILED' && !startError && <VerificationFailedNotice onInquiry={onInquiry} />}
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
          {isPreparing && <NoticeBox tone="seal">{VERIFICATION_PREPARING_MESSAGE}</NoticeBox>}
          {startError && !isPreparing && <NoticeBox>{startError.message}</NoticeBox>}
        </div>
      ),
      footer: (
        <>
          <Button variant="secondary" size="h44" onClick={onClose} disabled={start.isLoading}>
            나중에 하기
          </Button>
          <Button variant="verify" size="h44" onClick={handleStart} disabled={!isReady}>
            {start.isLoading ? '시작하는 중' : '인증 시작'}
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
