// Created: 2026-11-23 15:27
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, MobileFormLayout } from '@butler/ui';
import { IconTile } from '../../web/components/IconTile/IconTile';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { ProgressRing } from '../../web/components/ProgressRing/ProgressRing';
import { VerificationFailedNotice } from '../../web/components/VerificationFailedNotice/VerificationFailedNotice';
import { useGetLatestOwnershipVerification } from '../../web/hooks/useGetLatestOwnershipVerification';
import { useGetProperty } from '../../web/hooks/useGetProperty';
import { useGetPropertyOwnership } from '../../web/hooks/useGetPropertyOwnership';
import { usePostOwnershipVerification } from '../../web/hooks/usePostOwnershipVerification';
import { buildLocation } from '../../web/routes';
import { formatDateKST } from '../../web/utils/format';
import {
  clearPendingIdentityVerification,
  IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE,
  readIdentityVerificationRedirect,
  requestOwnerIdentityVerification,
} from '../../web/utils/identityVerification';
import {
  getVerificationAction,
  RUNNER_UNAVAILABLE_CODE,
  VERIFICATION_CONSENT_ROWS,
  VERIFICATION_PREPARING_MESSAGE,
  VERIFICATION_REVOKED_CODE,
  VERIFICATION_REVOKED_MESSAGE,
  VERIFICATION_RUNNING_MESSAGE,
} from '../../web/utils/ownershipVerification';
import { useGoBack, useGoTo } from '../utils/navigation';

const ConsentNotice = () => (
  <dl className="flex flex-col gap-2 rounded-input bg-surface-2 p-4 text-m-sub text-ink-2">
    {VERIFICATION_CONSENT_ROWS.map(([term, description]) => (
      <div key={term} className="flex gap-2">
        <dt className="w-14 shrink-0 font-semibold text-ink">{term}</dt>
        <dd>{description}</dd>
      </div>
    ))}
  </dl>
);

const CheckRow = ({ checked, disabled, onChange, muted = false, children }) => (
  <label className={`flex min-h-11 cursor-pointer items-center gap-2 text-body ${muted ? 'text-ink-2' : 'text-ink'}`}>
    <input type="checkbox" className="accent-accent" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    {children}
  </label>
);

// 화면 위 머리: 상태 아이콘(진행 중이면 도는 링) + 제목 + 호실 이름
const Heading = ({ icon, tone, isRunning, title, propertyName }) => (
  <section className="flex items-start gap-3">
    {isRunning ? <ProgressRing size="lg" label="권리자 인증 진행 중" /> : <IconTile icon={icon} tone={tone} size="lg" />}
    <div className="min-w-0 flex-1">
      <h2 className={`text-m-card font-semibold ${isRunning ? 'text-seal-ink' : 'text-ink'}`}>{title}</h2>
      {propertyName && <p className="mt-0.5 truncate text-m-sub text-ink-3">{propertyName}</p>}
    </div>
  </section>
);

// 임대인 앱 권리자 인증 화면(/properties/:propertyId/verify). 웹은 호실 상세 위 팝업(VerifyModal)이고, 앱은 하단 탭 없는 전체 화면이다.
// 흐름·문구는 웹 팝업과 같다: 개인정보 수집·이용 동의 → [인증 시작] → 본인인증 → 권리자 인증 요청 → 진행 중 → 완료·실패.
// 휴대폰에서는 본인인증이 리디렉션 방식이라 이 주소로 돌아온다(주소에 identityVerificationId). 그때 떠나기 전 남긴 값으로 요청을 잇는다.
// - notice: 부동산 등록 직후 안내(history state), onVerified: 인증을 마치면 내 정보(커뮤니티 권한)를 다시 읽는다.
export const VerifyPage = ({ propertyId, notice, onVerified, onUnauthorized }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const goTo = useGoTo();
  const goBack = useGoBack('propertyDetail', { propertyId });

  const hookOptions = { onUnauthorized };
  const propertyQuery = useGetProperty(propertyId, hookOptions);
  const property = propertyQuery.data;
  const activeOwnershipId = property?.myRelation?.type === 'OWNER' ? property.myRelation.ownershipId : undefined;
  const ownershipQuery = useGetPropertyOwnership(activeOwnershipId, hookOptions);
  const ownership = ownershipQuery.data;
  const { refetch: refetchProperty } = propertyQuery;
  const { refetch: refetchOwnership } = ownershipQuery;

  const handleFinished = useCallback(
    (attempt) => {
      refetchProperty();
      refetchOwnership();
      if (attempt.status === 'VERIFIED') onVerified?.();
    },
    [refetchProperty, refetchOwnership, onVerified],
  );
  const latest = useGetLatestOwnershipVerification(activeOwnershipId, { onFinished: handleFinished, onUnauthorized });
  const { trackAttempt } = latest;
  const start = usePostOwnershipVerification({ onUnauthorized });
  const { startVerification } = start;

  // 리디렉션으로 돌아왔으면 그 결과(처음 한 번만 읽는다)
  const [redirect] = useState(() => readIdentityVerificationRedirect(location.search));
  const [isConsented, setIsConsented] = useState(false);
  // [임시·시연용] 테스트 모드: 본인인증은 하되 본인인증 인적사항과 회원 정보 대조를 건너뛴다. 운영 배포 전 제거.
  const [isTestMode, setIsTestMode] = useState(() => Boolean(redirect?.pending?.testMode));
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState(() => redirect?.error ?? null);
  const isRedirectCleanedRef = useRef(false);
  const isRedirectSubmittedRef = useRef(false);

  const submit = useCallback(
    async (ownershipId, identityVerificationId, testMode) => {
      setIsConsented(false);
      const { data, error } = await startVerification({ ownershipId, consent: true, identityVerificationId, testMode });
      if (data) trackAttempt(data);
      else if (error?.code === VERIFICATION_REVOKED_CODE) refetchOwnership();
    },
    [startVerification, trackAttempt, refetchOwnership],
  );

  // 주소의 본인인증 결과를 지운다(새로 고침·뒤로 가기로 같은 요청을 다시 보내지 않게). 등록 직후 안내(state)는 남긴다.
  useEffect(() => {
    if (!redirect || isRedirectCleanedRef.current) return;
    isRedirectCleanedRef.current = true;
    if (redirect.error) clearPendingIdentityVerification();
    navigate({ pathname: location.pathname }, { replace: true, state: location.state });
  }, [redirect, navigate, location.pathname, location.state]);

  // 리디렉션으로 돌아왔으면 소유 관계를 읽은 뒤 한 번만 권리자 인증을 요청한다. 떠날 때와 다른 호실이면 다시 하라고 안내한다.
  useEffect(() => {
    if (!redirect?.pending || isRedirectSubmittedRef.current || !ownership) return;
    isRedirectSubmittedRef.current = true;
    clearPendingIdentityVerification();
    if (redirect.pending.ownershipId !== ownership.id) {
      setIdentityError({ message: IDENTITY_VERIFICATION_INCOMPLETE_MESSAGE });
      return;
    }
    submit(ownership.id, redirect.identityVerificationId, Boolean(redirect.pending.testMode));
  }, [redirect, ownership, submit]);

  const action = ownership && getVerificationAction(ownership);
  const isDone = ownership && action === null && ownership.verificationStatus === 'VERIFIED';
  const isBusy = isVerifyingIdentity || start.isLoading;
  const isReady = isConsented && !isBusy;
  const startError = start.error;
  const isPreparing = startError?.code === RUNNER_UNAVAILABLE_CODE;
  const toDetail = () => goTo('propertyDetail', { propertyId }, { replace: true });

  // 본인인증 → 권리자 인증 요청. PC는 팝업으로 끝나 여기서 바로 잇고, 휴대폰은 redirectUrl로 떠났다가 돌아와서 잇는다.
  const handleStart = async () => {
    if (!isReady) return;
    setIdentityError(null);
    setIsVerifyingIdentity(true);
    const identity = await requestOwnerIdentityVerification({
      redirectUrl: new URL(buildLocation('propertyVerify', { propertyId }).pathname, window.location.origin).href,
      pending: { ownershipId: ownership.id, testMode: isTestMode },
    });
    setIsVerifyingIdentity(false);
    if (identity.error) {
      setIdentityError(identity.error);
      return;
    }
    submit(ownership.id, identity.identityVerificationId, isTestMode);
  };

  const closeButton = (label = '닫기') => (
    <Button type="button" variant="secondary" size="h52" className="flex-1" onClick={goBack}>
      {label}
    </Button>
  );

  let view;
  if (propertyQuery.error && !property) {
    view = { icon: Shield, tone: 'mute', body: <NoticeBox>{propertyQuery.error.message}</NoticeBox>, cta: closeButton() };
  } else if (property && !activeOwnershipId) {
    view = { icon: Shield, tone: 'mute', body: <NoticeBox>지금 소유 중인 호실만 인증할 수 있어요.</NoticeBox>, cta: closeButton() };
  } else if (ownershipQuery.error && !ownership) {
    view = { icon: Shield, tone: 'mute', body: <NoticeBox>{ownershipQuery.error.message}</NoticeBox>, cta: closeButton() };
  } else if (!ownership || (latest.isLoading && !latest.data)) {
    view = {
      icon: Shield,
      tone: 'seal',
      body: (
        <p role="status" className="py-6 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      ),
      cta: closeButton(),
    };
  } else if (latest.isActive) {
    view = {
      isRunning: true,
      title: '소유자 정보를 확인하고 있어요',
      body: (
        <>
          <NoticeBox tone="seal">{VERIFICATION_RUNNING_MESSAGE}</NoticeBox>
          <p role="status" className="text-m-sub text-ink-2">
            이 화면을 나가도 확인은 계속돼요. 끝나면 부동산 상세의 권리자 인증 카드에서 결과를 볼 수 있어요.
          </p>
        </>
      ),
      cta: closeButton(),
    };
  } else if (isDone) {
    view = {
      icon: ShieldCheck,
      tone: 'seal',
      title: '권리자 인증을 마쳤어요',
      body: (
        <dl className="rounded-card border border-line bg-surface px-4">
          <div className="flex items-center justify-between gap-4 border-b border-line py-3">
            <dt className="text-m-label text-ink-3">인증일</dt>
            <dd className="font-num text-body tabular-nums text-seal-ink">{formatDateKST(ownership.verifiedAt) ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-m-label text-ink-3">인증 만료일</dt>
            <dd className="font-num text-body tabular-nums text-seal-ink">{formatDateKST(ownership.verificationExpiresAt) ?? '—'}</dd>
          </div>
        </dl>
      ),
      cta: (
        <>
          <Button type="button" variant="secondary" size="h52" className="flex-1" onClick={() => goTo('propertyRegister')}>
            다른 호실 등록
          </Button>
          <Button type="button" size="h52" className="flex-1" onClick={toDetail}>
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
      cta: (
        <>
          {closeButton()}
          <Button type="button" size="h52" className="flex-1" onClick={() => goTo('supportInquiry')}>
            <Phone size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
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
        <>
          {latest.data?.status === 'FAILED' && !startError && !identityError && <VerificationFailedNotice onInquiry={() => goTo('supportInquiry')} />}
          <div className="flex flex-col gap-3">
            <p className="text-m-label font-semibold text-ink">개인정보 수집·이용 동의</p>
            <ConsentNotice />
            <div>
              <CheckRow checked={isConsented} disabled={isBusy} onChange={setIsConsented}>
                개인정보 수집·이용에 동의해요
              </CheckRow>
              {/* [임시·시연용] 테스트 모드 토글. 운영 배포 전 제거. */}
              <CheckRow checked={isTestMode} disabled={isBusy} onChange={setIsTestMode} muted>
                테스트 모드 (본인인증 인적사항 대조 건너뛰기)
              </CheckRow>
            </div>
            <p className="text-m-sub text-ink-3">인증 시작을 누르면 본인인증 창이 열려요. 본인인증을 마쳐야 권리자 인증이 진행돼요.</p>
          </div>
          {identityError && <NoticeBox>{identityError.message}</NoticeBox>}
          {isPreparing && <NoticeBox tone="seal">{VERIFICATION_PREPARING_MESSAGE}</NoticeBox>}
          {startError && !isPreparing && !identityError && <NoticeBox>{startError.message}</NoticeBox>}
        </>
      ),
      cta: (
        <>
          <Button type="button" variant="secondary" size="h52" onClick={goBack} disabled={isBusy}>
            나중에 하기
          </Button>
          <Button type="button" variant="verify" size="h52" className="flex-1" onClick={handleStart} disabled={!isReady}>
            {isVerifyingIdentity ? '본인인증 중' : start.isLoading ? '시작하는 중' : '인증 시작'}
          </Button>
        </>
      ),
    };
  }

  return (
    <MobileFormLayout shell="landlord-app-form" topBar={{ title: action === 'RENEW' ? '권리자 재인증' : '권리자 인증', onBack: goBack }} cta={view.cta}>
      <Heading
        icon={view.icon}
        tone={view.tone}
        isRunning={view.isRunning}
        title={view.title ?? '권리자 인증'}
        propertyName={property?.displayName}
      />
      {notice && <NoticeBox tone="info">{notice}</NoticeBox>}
      {latest.error && <NoticeBox>{latest.error.message}</NoticeBox>}
      {view.body}
    </MobileFormLayout>
  );
};
