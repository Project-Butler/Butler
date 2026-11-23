// Created: 2026-11-23 15:27
import { Badge, Button } from '@butler/ui';
import { Phone, Shield, ShieldAlert } from 'lucide-react';
import { IconTile } from '../../../web/components/IconTile/IconTile';
import { ProgressRing } from '../../../web/components/ProgressRing/ProgressRing';
import { getVerificationPanelState } from '../../../web/components/VerificationPanel/VerificationPanel';
import { formatDateKST } from '../../../web/utils/format';
import {
  VERIFICATION_FAILED_MESSAGE,
  VERIFICATION_REVOKED_MESSAGE,
  VERIFICATION_RUNNING_MESSAGE,
} from '../../../web/utils/ownershipVerification';

// 앱 부동산 상세(M06)의 권리자 인증 카드. 상태 판단은 웹 호실 상세 카드(VerificationPanel)와 같다.
// 할 일이 있거나 진행 중일 때만 그린다. 인증 완료·소유 종료는 위 인증 칩과 [기본 정보]의 등기부 대조 카드가 보여 준다.
// - 미인증: [권리자 인증하기] / 갱신 기간·만료: [인증 다시 하기] / 실패: [문의하기][다시 인증하기] / 취소: [문의하기]
// - 진행 중: 도는 링(ProgressRing) + 안내만(버튼 없음)
export const VerificationCard = ({ ownership, attempt, isAttemptRunning, renewalNotice, onVerify, onInquiry }) => {
  const state = getVerificationPanelState({ ownership, attempt, isAttemptRunning });
  if (state === 'VERIFIED' || state === 'ENDED') return null;

  const expiresOn = formatDateKST(ownership.verificationExpiresAt);
  const verifyButton = (label) => (
    <Button type="button" variant="verifyOutline" size="h48" className="flex-1" onClick={onVerify}>
      {label}
    </Button>
  );
  const inquiryButton = (
    <Button type="button" variant="secondary" size="h48" className="flex-1" onClick={onInquiry}>
      <Phone size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
      문의하기
    </Button>
  );

  const view = {
    RENEW: {
      icon: ShieldAlert,
      tone: 'warn',
      title: '권리자 인증 갱신',
      text: renewalNotice?.message ?? `${expiresOn}에 끝나요. 다시 인증해 주세요.`,
      actions: verifyButton('인증 다시 하기'),
    },
    UNVERIFIED: {
      icon: Shield,
      tone: 'seal',
      title: '권리자 인증',
      text: '인증하면 호실 이력, 면적·층 수정, 계약 등록을 할 수 있어요',
      actions: verifyButton('권리자 인증하기'),
    },
    FAILED: {
      icon: ShieldAlert,
      tone: 'crit',
      title: '권리자 인증 실패',
      chip: '실패',
      text: VERIFICATION_FAILED_MESSAGE,
      alert: true,
      actions: (
        <>
          {inquiryButton}
          {verifyButton('다시 인증하기')}
        </>
      ),
    },
    REVOKED: { icon: ShieldAlert, tone: 'crit', title: '권리자 인증 취소', chip: '취소', text: VERIFICATION_REVOKED_MESSAGE, alert: true, actions: inquiryButton },
    RUNNING: { title: '권리자 인증 진행 중', text: VERIFICATION_RUNNING_MESSAGE },
  }[state];

  // 진행 중은 남색 연한 바탕(design.md §2-4 안내(인증))으로 눈에 띄게 한다.
  const isRunning = state === 'RUNNING';
  return (
    <section aria-label="권리자 인증" className={`flex flex-col gap-3 rounded-card border border-line p-4 ${isRunning ? 'bg-seal-soft' : 'bg-surface'}`}>
      <div className="flex items-start gap-3">
        {isRunning ? <ProgressRing surface="surface" label="권리자 인증 진행 중" /> : <IconTile icon={view.icon} tone={view.tone} />}
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-2 text-m-card font-semibold ${isRunning ? 'text-seal-ink' : 'text-ink'}`}>
            {view.title}
            {view.chip && (
              <Badge mobile tone="danger">
                {view.chip}
              </Badge>
            )}
          </p>
          <p role={view.alert ? 'alert' : undefined} className={`mt-0.5 text-m-sub ${view.alert ? 'text-crit-ink' : isRunning ? 'text-seal-ink' : 'text-ink-3'}`}>
            {view.text}
          </p>
        </div>
      </div>
      {view.actions && <div className="flex gap-2">{view.actions}</div>}
    </section>
  );
};
