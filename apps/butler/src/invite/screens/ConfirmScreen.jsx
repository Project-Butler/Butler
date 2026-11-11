import { Button } from '@butler/ui';
import { Check, FileText } from 'lucide-react';
import { formatPeriod, getLeaseTypeLabel } from '../../shared/contractFormat';
import { InviteFrame } from '../InviteFrame';
import { Notice } from './Notice';

const BENEFITS = ['계약서와 계약 정보를 언제든 다시 봐요', '집에 문제가 생기면 앱으로 수리 요청을 보내요', '임대인에게 내 연락처 외 정보는 공개되지 않아요'];

// C2 계약 추가 확인(임차인으로 로그인 + 본인 확인 세션). [추가하기] = POST /tenant-invitations/:token/accept.
export const ConfirmScreen = ({ contract, email, busy, error, onAccept, onSwitchAccount }) => {
  const fileCount = contract.sharedDocuments?.length ?? 0;
  return (
    <InviteFrame
      cta={
        <>
          <Button size="h52" className="w-full" onClick={onAccept} disabled={busy}>
            {busy ? '추가하는 중이에요' : '추가하기'}
          </Button>
          <p className="text-center text-m-sub text-ink-3">
            {email} 계정으로 추가돼요 ·{' '}
            <button type="button" onClick={onSwitchAccount} className="underline underline-offset-2">
              다른 계정
            </button>
          </p>
        </>
      }
    >
      <h1 className="text-m-h1 font-bold text-ink">
        이 계약을
        <br />
        내 계약에 추가할까요?
      </h1>
      {error && <Notice>{error}</Notice>}
      <section aria-label="추가할 계약" className="rounded-card border border-line bg-surface p-4">
        <p className="text-m-card font-semibold text-ink">{contract.propertyDisplayName}</p>
        <p className="mt-0.5 font-num text-m-sub tabular-nums text-ink-3">
          {formatPeriod(contract.startDate, contract.endDate)} · {getLeaseTypeLabel(contract.leaseType)}
        </p>
        {fileCount > 0 && (
          <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-m-sub text-ink-2">
            <FileText size={16} strokeWidth={1.8} className="text-crit-ink" aria-hidden="true" />
            계약서 <span className="font-num tabular-nums">{fileCount}</span>개 함께 보관
          </p>
        )}
      </section>
      <ul className="space-y-2 text-body text-ink-2">
        {BENEFITS.map((text) => (
          <li key={text} className="flex gap-2">
            <Check size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
    </InviteFrame>
  );
};
