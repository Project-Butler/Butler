import { useState } from 'react';
import { Badge, Button } from '@butler/ui';
import { CalendarClock, CalendarDays, ChevronDown, ChevronRight, Clock, Coins, FileText, History, KeyRound, Phone, Plus, StickyNote, User, Wallet } from 'lucide-react';
import { ContractTermination } from '../ContractTermination/ContractTermination';
import { IconTile } from '../IconTile/IconTile';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { useGetContract } from '../../../../shared/useGetContract';
import { useGetContractList } from '../../hooks/useGetContractList';
import {
  CONTRACT_LEGAL_NOTICE,
  formatContractAmount,
  formatPeriod,
  formatPhone,
  formatRentPaymentDay,
  formatWon,
  getContractDdayBadge,
  getContractStatusBadge,
  getEndedOwnershipNotice,
  getLeaseTypeLabel,
  isContractInProgress,
} from '../../utils/contract';

const PAST_SIZE = 10;

const Cell = ({ icon: Icon, label, children }) => (
  <div className="bg-surface p-4">
    <Icon size={17} className="text-ink-3" aria-hidden="true" />
    <p className="mt-2 text-sub text-ink-3">{label}</p>
    <div className="mt-0.5 flex items-center gap-2 font-num text-body font-semibold tabular-nums text-ink">{children}</div>
  </div>
);

// 지난 계약 한 줄: 누르면 펼쳐서 연락처·메모·해지 내용을 본다(계약 상세 페이지를 대신한다).
const PastContractRow = ({ contract, defaultOpen, onUnauthorized }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const detail = useGetContract(isOpen ? contract.id : undefined, { onUnauthorized });
  const full = detail.data;
  const status = getContractStatusBadge(contract);
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 py-2.5 text-left text-body hover:bg-surface-2"
      >
        {isOpen ? <ChevronDown size={16} className="text-ink-3" aria-hidden="true" /> : <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />}
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="w-24 truncate text-ink">{contract.tenantName}</span>
        <span className="flex-1 font-num tabular-nums text-ink-2">{formatContractAmount(contract)}</span>
        <span className="font-num tabular-nums text-ink-3">{formatPeriod(contract)}</span>
      </button>
      {isOpen && (
        <dl className="mb-3 ml-7 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-input bg-surface-2 p-4 text-sub">
          {detail.error && <NoticeBox className="col-span-2">{detail.error.message}</NoticeBox>}
          {!full && !detail.error && <p className="col-span-2 text-ink-3">불러오는 중입니다</p>}
          {full && (
            <>
              <dt className="text-ink-3">연락처</dt>
              <dd className="font-num tabular-nums text-ink">{full.tenant?.phone ? formatPhone(full.tenant.phone) : '—'}</dd>
              <dt className="text-ink-3">월세 입금일</dt>
              <dd className="text-ink">{full.rentPaymentDay != null ? formatRentPaymentDay(full.rentPaymentDay) : '—'}</dd>
              {full.terminatedOn && (
                <>
                  <dt className="text-ink-3">해지일 · 사유</dt>
                  <dd className="text-ink">
                    <span className="font-num tabular-nums">{full.terminatedOn}</span> · {full.terminationReason || '—'}
                  </dd>
                </>
              )}
              <dt className="text-ink-3">메모</dt>
              <dd className="whitespace-pre-wrap text-ink-2">{full.memo || '—'}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
};

// 호실 상세의 계약 영역(계약 상세 페이지를 흡수). 지금 계약(진행 중 → 시작 전) 하나를 크게, 지난 계약은 펼쳐 보는 목록.
// 버튼은 이 영역 안에만: [해지](펼침)·[수정]·[갱신 계약 등록], 계약이 없으면 [계약 등록](인증 완료 호실만).
// focusContractId: /contracts/:id 로 들어온 계약. 지난 계약이면 펼쳐 둔다.
export const PropertyContractArea = ({ propertyId, ownershipId, canRegister, focusContractId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const currentList = useGetContractList({ ownershipId, status: 'ACTIVE,EXPIRING_SOON,UPCOMING', sort: 'endDate:asc', size: 1 }, hookOptions);
  const pastList = useGetContractList(
    { ownershipId, status: 'EXPIRED,TERMINATED', includeEndedOwnership: 'true', sort: 'endDate:desc', size: PAST_SIZE },
    hookOptions,
  );
  const currentId = currentList.data?.items[0]?.id;
  const currentQuery = useGetContract(currentId, hookOptions);
  const contract = currentQuery.data;
  const [isTerminating, setIsTerminating] = useState(false);
  const pastContracts = pastList.data?.items ?? [];

  const refresh = () => {
    setIsTerminating(false);
    currentList.refetch();
    pastList.refetch();
  };

  const canEdit = contract && !contract.isReadOnly;
  const canRenew = canEdit && isContractInProgress(contract.status);
  const status = contract && getContractStatusBadge(contract);
  const dday = contract && getContractDdayBadge(contract);
  const endedOwnershipNotice = contract && getEndedOwnershipNotice(contract.endReason);
  const isMonthly = contract?.leaseType === 'MONTHLY';
  const goEdit = () => onNavigate('contractEdit', { contractId: contract.id });

  const actions = contract ? (
    canEdit && (
      <>
        {!isTerminating && (
          <Button variant="secondary" size="h44" onClick={() => setIsTerminating(true)}>
            해지
          </Button>
        )}
        <Button variant="secondary" size="h44" onClick={goEdit}>
          수정
        </Button>
        {canRenew && (
          <Button size="h44" onClick={() => onNavigate('contractRegister', { renewFrom: contract.id })}>
            <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
            갱신 계약 등록
          </Button>
        )}
      </>
    )
  ) : (
    canRegister &&
    currentList.data && (
      <Button size="h44" onClick={() => onNavigate('contractRegister', { propertyId })}>
        <Plus size={16} className="-ml-0.5 mr-1 inline-block" />
        계약 등록
      </Button>
    )
  );

  const isLoading = (currentList.isLoading && !currentList.data) || (currentId && !contract && !currentQuery.error);

  return (
    <section className="property-detail-page__contract-area overflow-hidden rounded-card border border-line bg-surface" aria-labelledby="contract-area-title">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 id="contract-area-title" className="flex items-center gap-2 text-section font-semibold text-ink">
          <FileText size={20} className="text-ink-3" aria-hidden="true" />
          계약
        </h2>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {currentList.error && <NoticeBox className="mx-5 mb-4">{currentList.error.message}</NoticeBox>}
      {currentQuery.error && <NoticeBox className="mx-5 mb-4">{currentQuery.error.message}</NoticeBox>}
      {isLoading && <p className="px-5 pb-5 text-body text-ink-3">불러오는 중입니다</p>}

      {!isLoading && !contract && currentList.data && (
        <div className="mx-5 mb-5 flex items-center gap-4 rounded-input bg-surface-2 p-5">
          <IconTile icon={KeyRound} tone="mute" />
          <div>
            <p className="text-body font-semibold text-ink">비어 있는 호실이에요</p>
            <p className="text-sub text-ink-3">
              {canRegister ? '계약을 등록하면 금액·기간·입금일을 여기서 관리해요.' : '권리자 인증을 마치면 계약을 등록할 수 있어요.'}
            </p>
          </div>
        </div>
      )}

      {contract && (
        <>
          {endedOwnershipNotice && <NoticeBox tone="warn" className="mx-5 mb-4">{endedOwnershipNotice}</NoticeBox>}
          <div className="flex items-center gap-3 border-y border-line px-5 py-3">
            <IconTile icon={User} tone="mute" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-body font-semibold text-ink">
                {contract.tenantName}
                <Badge tone={status.tone}>{status.label}</Badge>
                {dday && (
                  <Badge tone={dday.tone} className="font-num tabular-nums">
                    {dday.label}
                  </Badge>
                )}
              </p>
              <p className="inline-flex items-center gap-1.5 font-num text-sub tabular-nums text-ink-2">
                <Phone size={13} className="text-ink-3" aria-hidden="true" />
                {contract.tenant?.phone ? formatPhone(contract.tenant.phone) : '연락처 없음'}
              </p>
            </div>
            <span className="text-sub text-ink-3">
              {getLeaseTypeLabel(contract.leaseType)} 계약 · {CONTRACT_LEGAL_NOTICE}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-px bg-line">
            <Cell icon={Coins} label="보증금">{formatWon(contract.deposit)}</Cell>
            <Cell icon={Wallet} label="월세">{isMonthly ? formatWon(contract.monthlyRent) : '—'}</Cell>
            <Cell icon={CalendarDays} label="월세 입금일">
              {!isMonthly ? (
                '—'
              ) : contract.rentPaymentDay != null ? (
                formatRentPaymentDay(contract.rentPaymentDay)
              ) : (
                <span className="text-warn-ink">입력 필요</span>
              )}
              {isMonthly && canEdit && (
                <button type="button" onClick={goEdit} className="font-sans text-sub font-medium text-accent hover:text-accent-strong">
                  {contract.rentPaymentDay != null ? '변경' : '입력'}
                </button>
              )}
            </Cell>
            <Cell icon={CalendarDays} label="시작일">{contract.startDate}</Cell>
            <Cell icon={CalendarClock} label="종료일">{contract.endDate}</Cell>
            <Cell icon={Clock} label="남은 기간">{dday ? dday.label : '—'}</Cell>
          </div>
          {contract.memo && (
            <div className="flex items-start gap-2 border-t border-line px-5 py-3 text-body text-ink-2">
              <StickyNote size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
              <span className="whitespace-pre-wrap">{contract.memo}</span>
            </div>
          )}
          {canEdit && isContractInProgress(contract.status) && !isTerminating && (
            <p className="border-t border-line px-5 py-3 text-sub text-ink-3">
              진행 중인 계약은 월세 입금일·연락처·메모만 고칠 수 있어요. 조건을 바꾸려면 갱신 계약을 등록하세요.
            </p>
          )}
          {contract.isReadOnly && <p className="border-t border-line px-5 py-3 text-sub text-ink-3">끝난 계약이나 소유가 끝난 호실의 계약은 보기만 할 수 있어요.</p>}
          {isTerminating && (
            <ContractTermination contract={contract} onTerminated={refresh} onCancel={() => setIsTerminating(false)} onUnauthorized={onUnauthorized} />
          )}
        </>
      )}

      {pastContracts.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <p className="mb-1 flex items-center gap-2 text-label font-semibold text-ink">
            <History size={15} className="text-ink-3" aria-hidden="true" />
            지난 계약
          </p>
          <ul>
            {pastContracts.map((past) => (
              <PastContractRow key={past.id} contract={past} defaultOpen={past.id === focusContractId} onUnauthorized={onUnauthorized} />
            ))}
          </ul>
        </div>
      )}
      {pastList.error && <NoticeBox className="mx-5 mb-4">{pastList.error.message}</NoticeBox>}
    </section>
  );
};
