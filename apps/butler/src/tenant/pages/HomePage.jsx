import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card } from '@butler/ui';
import { getContractList } from '@butler/api-client';
import { ChevronRight, FileText, Wrench } from 'lucide-react';
import { formatDday, formatMonthDay, formatPeriod, getTenantStatusBadge } from '../../shared/contractFormat';
import { useLoad } from '../hooks/useLoad';
import { contractPath, TICKETS_PATH } from '../routes';
import { getNextRentDays, sortTenantContracts } from '../utils/home';

// 임차인에게 보이는 계약은 서버가 정한다(연결된 계약만). 한 사람이 가진 계약은 몇 건뿐이라 한 번에 받는다.
const LIST_PARAMS = { sort: 'endDate:asc', size: 50 };

const ContractCard = ({ contract, onOpen }) => {
  const badge = getTenantStatusBadge(contract.status);
  const rentDays = getNextRentDays(contract);
  return (
    <section aria-label={contract.property?.displayName} className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-m-card font-semibold text-ink">{contract.property?.displayName}</p>
        <Badge mobile tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
      </div>
      <p className="mt-0.5 font-num text-num-sub tabular-nums text-ink-3">{formatPeriod(contract.startDate, contract.endDate)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
        <div>
          <p className="text-m-sub text-ink-3">다음 월세</p>
          {contract.nextRentPaymentDate ? (
            <p className="flex items-center gap-1 font-num font-semibold tabular-nums text-ink">
              {formatMonthDay(contract.nextRentPaymentDate)}
              <Badge tone="warning" className="rounded-chip font-num tabular-nums">
                {formatDday(rentDays)}
              </Badge>
            </p>
          ) : (
            <p className="font-semibold text-ink-3">—</p>
          )}
        </div>
        <div>
          <p className="text-m-sub text-ink-3">임대인</p>
          <p className="font-semibold text-ink">{contract.landlord?.name ?? '—'}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex w-full items-center gap-2 rounded-input bg-surface-2 px-3 py-2.5 text-m-sub font-semibold text-ink-2 hover:bg-line/60"
      >
        <FileText size={16} strokeWidth={1.8} className="text-crit-ink" aria-hidden="true" />
        계약서 보기
        <ChevronRight size={16} strokeWidth={1.8} className="ml-auto text-ink-3" aria-hidden="true" />
      </button>
    </section>
  );
};

// 임차인 홈(시안 E1): 인사 · 내 계약 카드(기간 · 상태 · 다음 월세 · 임대인 · 계약서 보기) · 수리 요청 바로가기.
export const HomePage = ({ user, onUnauthorized }) => {
  const navigate = useNavigate();
  const contracts = useLoad('tenant-contracts', () => getContractList(LIST_PARAMS).then((body) => body.data ?? []), { onUnauthorized });
  const list = sortTenantContracts(contracts.data ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-m-h1 font-bold text-ink">{user.name} 님, 안녕하세요</h1>

      {contracts.isLoading && (
        <p role="status" className="text-body text-ink-3">
          계약을 불러오는 중이에요
        </p>
      )}
      {contracts.error && (
        <Card>
          <p role="alert" className="text-body text-crit-ink">
            {contracts.error.message}
          </p>
          <Button variant="secondary" size="h44" className="mt-3 w-full" onClick={contracts.refetch}>
            다시 불러오기
          </Button>
        </Card>
      )}
      {!contracts.isLoading && !contracts.error && list.length === 0 && (
        <Card>
          <p className="text-m-card font-semibold text-ink">아직 연결된 계약이 없어요</p>
          <p className="mt-1 text-body text-ink-2">임대인이 보낸 초대 링크를 열면 계약이 여기에 추가돼요.</p>
        </Card>
      )}
      {list.map((contract) => (
        <ContractCard key={contract.id} contract={contract} onOpen={() => navigate(contractPath(contract.id))} />
      ))}

      <button
        type="button"
        onClick={() => navigate(TICKETS_PATH)}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left hover:bg-surface-2"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input bg-accent text-white">
          <Wrench size={22} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-m-card font-semibold text-ink">수리 요청하기</span>
          <span className="text-m-sub text-ink-3">고장·누수·소음을 사진과 함께 알려요</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-ink-3" aria-hidden="true" />
      </button>
    </div>
  );
};
