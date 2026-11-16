import { Button } from '@butler/ui';
import { Building2, FileText, Lock, MailOpen, ShieldCheck } from 'lucide-react';
import { formatMonthDayKST, formatPeriod, getLeaseTypeLabel } from '../../shared/contractFormat';
import { InviteFrame } from '../InviteFrame';
import { Notice } from './Notice';

// B1 초대 요약(공개). 명세 R-15 대로 금액·임차인 정보 없이: 임대인 이름 + 소유자 인증, 호실, 계약 기간, 공유 파일 수(잠금), 링크 기한.
export const SummaryScreen = ({ preview, notice, busy, onContinue }) => {
  const leaseLabel = getLeaseTypeLabel(preview.leaseType);
  return (
    <InviteFrame
      cta={
        <Button size="h52" className="w-full" onClick={onContinue} disabled={busy}>
          {busy ? '확인하는 중이에요' : '계약서 확인하기'}
        </Button>
      }
    >
      <p className="flex items-center gap-2 text-m-sub font-semibold text-accent">
        <MailOpen size={16} strokeWidth={1.8} aria-hidden="true" />
        임대차 계약 초대
      </p>
      <h1 className="text-m-h1 font-bold text-ink">
        {preview.landlordName} 님이
        <br />
        계약을 공유했어요
      </h1>
      {notice && <Notice>{notice}</Notice>}
      <section aria-label="계약 요약" className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-accent-soft text-accent">
            <Building2 size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-m-card font-semibold text-ink">{preview.propertyDisplayName}</p>
            {leaseLabel && <p className="text-m-sub text-ink-3">{leaseLabel} 계약</p>}
          </div>
        </div>
        <dl className="border-t border-line">
          <div className="flex items-center justify-between gap-3 py-2.5 text-body">
            <dt className="text-ink-3">계약 기간</dt>
            <dd className="font-num font-semibold tabular-nums text-ink">{formatPeriod(preview.startDate, preview.endDate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-body">
            <dt className="text-ink-3">임대인</dt>
            <dd className="flex items-center gap-1.5 font-semibold text-ink">
              {preview.landlordName}
              {preview.landlordVerified && (
                <span className="inline-flex items-center gap-1 rounded-chip bg-seal-soft px-2 py-0.5 text-chip font-semibold text-seal-ink">
                  <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
                  소유자 인증
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>
      {preview.sharedDocumentCount > 0 && (
        <div className="flex items-center gap-3 rounded-input bg-surface p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-crit-box text-crit-ink">
            <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="flex-1 text-m-sub text-ink-2">
            계약서 파일 <span className="font-num tabular-nums">{preview.sharedDocumentCount}</span>개가 함께 공유됐어요
          </span>
          <Lock size={16} strokeWidth={1.8} className="shrink-0 text-ink-3" aria-label="본인 확인 뒤에 볼 수 있어요" />
        </div>
      )}
      <p className="text-m-sub text-ink-3">초대 링크는 {formatMonthDayKST(preview.expiresAt)}까지 쓸 수 있어요.</p>
    </InviteFrame>
  );
};
