import { Badge, Button } from '@butler/ui';
import { Phone, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { IconTile } from '../IconTile/IconTile';
import { formatDateKST } from '../../utils/format';
import {
  VERIFICATION_FAILED_MESSAGE,
  VERIFICATION_REVOKED_MESSAGE,
  VERIFICATION_RUNNING_MESSAGE,
  getVerificationAction,
} from '../../utils/ownershipVerification';

// 호실 상세 오른쪽 위 권리자 인증 카드. 상태별 문구·버튼(인증 절차는 보여 주지 않는다).
// - 인증 완료: 유효 기간 / 재인증 기간·만료: [인증 다시 하기] / 미인증: [권리자 인증하기]
// - 실패(최근 시도 FAILED): 실패 칩 + 안내 + [문의하기][다시 인증하기] / 취소(REVOKED): [문의하기]만
// - 진행 중: 안내만(버튼 잠금)
export const getVerificationPanelState = ({ ownership, attempt, isAttemptRunning, now = new Date() }) => {
  const action = getVerificationAction(ownership, now);
  if (ownership.isActive && isAttemptRunning) return 'RUNNING';
  if (action === 'INQUIRY') return 'REVOKED';
  if (ownership.isActive && attempt?.status === 'FAILED' && action) return 'FAILED';
  if (action === 'RENEW') return 'RENEW';
  if (action === 'VERIFY') return 'UNVERIFIED';
  return ownership.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'ENDED';
};

export const VerificationPanel = ({ ownership, attempt, isAttemptRunning, renewalNotice, onVerify, onInquiry }) => {
  const state = getVerificationPanelState({ ownership, attempt, isAttemptRunning });
  const expiresOn = formatDateKST(ownership.verificationExpiresAt);
  const verifyButton = (label) => (
    <Button variant="verifyOutline" size="h44" onClick={onVerify}>
      {label}
    </Button>
  );
  const inquiryButton = (
    <Button variant="secondary" size="h44" onClick={onInquiry}>
      <Phone size={15} className="-ml-0.5 mr-1.5 inline-block" />
      문의하기
    </Button>
  );

  const view = {
    VERIFIED: { icon: ShieldCheck, tone: 'seal', title: '권리자 인증', text: expiresOn ? `${expiresOn}까지 유효해요` : '인증을 마쳤어요' },
    RENEW: { icon: ShieldAlert, tone: 'warn', title: '권리자 인증 갱신', text: renewalNotice?.message ?? `${expiresOn}에 끝나요. 다시 인증해 주세요.`, actions: verifyButton('인증 다시 하기') },
    UNVERIFIED: { icon: Shield, tone: 'seal', title: '권리자 인증', text: '인증하면 호실 이력, 면적·층 수정, 계약 등록을 할 수 있어요', actions: verifyButton('권리자 인증하기') },
    FAILED: { icon: ShieldAlert, tone: 'crit', title: '권리자 인증 실패', chip: '실패', text: VERIFICATION_FAILED_MESSAGE, alert: true, actions: <>{inquiryButton}{verifyButton('다시 인증하기')}</> },
    REVOKED: { icon: ShieldAlert, tone: 'crit', title: '권리자 인증 취소', chip: '취소', text: VERIFICATION_REVOKED_MESSAGE, alert: true, actions: inquiryButton },
    RUNNING: { icon: Shield, tone: 'seal', title: '권리자 인증 진행 중', text: VERIFICATION_RUNNING_MESSAGE },
    ENDED: { icon: Shield, tone: 'mute', title: '권리자 인증', text: '소유가 끝난 호실이에요' },
  }[state];

  return (
    <section className="property-detail-page__verify-panel overflow-hidden rounded-card border border-line bg-surface" aria-label="권리자 인증">
      <div className="flex items-start gap-3 p-5">
        <IconTile icon={view.icon} tone={view.tone} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-body font-semibold text-ink">
            {view.title}
            {view.chip && <Badge tone="danger">{view.chip}</Badge>}
          </p>
          <p role={view.alert ? 'alert' : undefined} className={`mt-0.5 text-sub ${view.alert ? 'text-crit-ink' : 'text-ink-3'}`}>
            {view.text}
          </p>
        </div>
      </div>
      {view.actions && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{view.actions}</div>}
    </section>
  );
};
