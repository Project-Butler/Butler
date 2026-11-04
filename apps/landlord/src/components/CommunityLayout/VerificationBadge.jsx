import { Badge } from '@butler/ui';

// 머리 오른쪽의 보는 사람 자격 배지. 기본은 초록 '인증 완료'(my-buildings 는 인증 보유 건물만 준다).
// blockedReason(목록·상세 응답의 writeBlockedReason)이 있으면 '미인증'·'인증 만료'().
export const VerificationBadge = ({ blockedReason = null }) => {
  if (blockedReason === 'UNVERIFIED') {
    return (
      <Badge tone="pending" className="whitespace-nowrap">
        미인증
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
