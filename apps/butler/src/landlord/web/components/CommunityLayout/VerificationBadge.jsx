import { Badge } from '@butler/ui';

// 머리 오른쪽의 보는 사람 자격 배지. 기본은 초록 '인증 완료'.
// blockedReason('UNVERIFIED' | 'EXPIRED' — 응답의 writeBlockedReason 또는 미리보기 상태)이 있으면 '인증 전' · '인증 만료'.
// 건물 바꾸기 줄 · 건물 선택 카드에도 같은 배지를 쓴다(건물의 verificationStatus).
export const VerificationBadge = ({ blockedReason = null }) => {
  if (blockedReason === 'UNVERIFIED') {
    return (
      <Badge tone="pending" className="whitespace-nowrap">
        인증 전
      </Badge>
    );
  }
  const isExpired = blockedReason === 'EXPIRED';
  return (
    <Badge tone={isExpired ? 'warning' : 'success'} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <i aria-hidden="true" className={`block h-1.5 w-1.5 rounded-full ${isExpired ? 'bg-warn' : 'bg-ok'}`} />
      {isExpired ? '인증 만료' : '인증 완료'}
    </Badge>
  );
};
