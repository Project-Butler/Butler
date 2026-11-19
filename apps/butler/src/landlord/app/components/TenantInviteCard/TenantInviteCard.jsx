import { UserPlus } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { getTenantInviteEntry } from '../../utils/tenantInviteView';

// 임차인 계정이 아직 연결되지 않은 계약의 초대 카드(#169). 호실 상세 [기본 정보]와 계약 관리에서 쓴다.
// 초대할 수 없는 계약(끝났거나 이미 연결됨)이면 그리지 않는다. 버튼은 초대 화면(M15)으로 간다.
export const TenantInviteCard = ({ contract, onInvite }) => {
  const entry = getTenantInviteEntry(contract);
  if (!entry) return null;
  return (
    <section aria-label="임차인 초대" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-m-card font-semibold text-ink">{contract.tenantName}님이 아직 앱에 연결되지 않았어요</h2>
          <p className="text-m-sub text-ink-3">초대 링크를 보내면 계약 조회·수리 요청·대화를 할 수 있어요</p>
        </div>
        {entry.chip && (
          <Badge mobile tone={entry.chip.tone} className="shrink-0">
            {entry.chip.label}
          </Badge>
        )}
      </div>
      <Button size="h48" onClick={() => onInvite(contract.id)}>
        <UserPlus size={16} className="-ml-0.5 mr-1.5 inline-block" aria-hidden="true" />
        {entry.actionLabel}
      </Button>
    </section>
  );
};
