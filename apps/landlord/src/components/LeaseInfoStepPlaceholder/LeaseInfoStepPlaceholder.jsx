import { Badge, Button, Card } from '@butler/ui';
import { BottomActionBar } from '../BottomActionBar/BottomActionBar';

// 부동산 등록 2단계(임대 정보) 자리. 호실·소유 관계는 1단계에서 이미 만들어졌다.
// TODO(#4 계약 관리): 임대 정보 입력 폼으로 교체. 지금은 API를 호출하지 않는다.
export const LeaseInfoStepPlaceholder = ({ displayName, onDone }) => (
  <>
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sub text-ink-2">등록한 부동산</p>
          <p className="mt-1 truncate text-card font-semibold text-ink">{displayName}</p>
        </div>
        <Badge tone="pending">미인증</Badge>
      </Card>

      <div className="rounded-card border border-dashed border-line bg-surface-2 px-5 py-10 text-center">
        <p className="text-card font-semibold text-ink-2">임대 정보 입력은 곧 제공됩니다</p>
        <p className="mt-1 text-body text-ink-3">계약 관리 기능이 열리면 이 단계에서 임차인·보증금·계약 기간을 입력합니다.</p>
      </div>
    </div>

    <BottomActionBar>
      <Button size="lg" className="w-full" onClick={onDone}>
        나중에 입력 · 완료
      </Button>
    </BottomActionBar>
  </>
);
