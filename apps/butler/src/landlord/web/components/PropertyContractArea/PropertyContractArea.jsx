import { useEffect, useState } from 'react';
import { Badge, Button } from '@butler/ui';
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  FileText,
  History,
  Info,
  KeyRound,
  Link2,
  Phone,
  Plus,
  Send,
  ShieldAlert,
  StickyNote,
  User,
  Wallet,
} from 'lucide-react';
import { ContractTermination } from '../ContractTermination/ContractTermination';
import { IconTile } from '../IconTile/IconTile';
import { NoticeBox } from '../NoticeBox/NoticeBox';
import { TenantInviteModal } from '../TenantInviteModal/TenantInviteModal';
import { useGetContract } from '../../../../shared/useGetContract';
import { useGetContractList } from '../../hooks/useGetContractList';
import { useGetTenantInvitationList } from '../../hooks/useGetTenantInvitationList';
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
import { getInvitationChip, hasVerifyFailureAlert, isAccountNameDifferent } from '../../utils/tenantInvite';

const PAST_SIZE = 10;

const Cell = ({ icon: Icon, label, children }) => (
  <div className="bg-surface p-4">
    <Icon size={17} className="text-ink-3" aria-hidden="true" />
    <p className="mt-2 text-sub text-ink-3">{label}</p>
    <div className="mt-0.5 flex items-center gap-2 font-num text-body font-semibold tabular-nums text-ink">{children}</div>
  </div>
);

const CHIP_ICON = { PENDING: Clock, ACCEPTED: Link2 };
const ACTION_LABEL = { reissue: '링크 다시 만들기', renew: '새 링크 만들기', invite: '임차인 초대' };

// 임차인 앱 연결 상태(A4): 초대 대기 · 링크 만료 · 앱 연결됨 칩과 [링크 다시 만들기]·[새 링크 만들기]·[임차인 초대].
// 대기 칩의 만료일과 본인 확인 실패 안내는 최신 초대(A-07)로 읽는다. 읽기 전용 계약은 버튼 없이 칩만 보여 준다.
const TenantInviteStatus = ({ contract, invitationsReloadKey, onInvite, onUnauthorized }) => {
  const invitationStatus = contract.tenant?.invitationStatus ?? null;
  const needsLatest = !contract.isReadOnly && invitationStatus === 'PENDING';
  const invitations = useGetTenantInvitationList(needsLatest ? contract.id : undefined, { onUnauthorized });
  const { refetch } = invitations;
  useEffect(() => {
    if (invitationsReloadKey > 0) refetch();
  }, [invitationsReloadKey, refetch]);

  const latest = invitations.data?.[0];
  const chip = getInvitationChip(invitationStatus, latest);
  const action = contract.isReadOnly ? null : chip.action;
  const ChipIcon = CHIP_ICON[chip.kind];
  const accountName = contract.tenant?.accountName;
  const showFailureAlert = hasVerifyFailureAlert(invitationStatus, latest);

  // 읽기 전용인데 초대한 적도 없으면 이 줄을 그리지 않는다.
  if (!chip.label && !action) return null;

  return (
    <div className="space-y-2 border-b border-line px-5 py-3">
      <div className="flex items-center gap-3">
        <p className="text-sub font-semibold text-ink-2">임차인 앱</p>
        {chip.label ? (
          <Badge tone={chip.tone} className="inline-flex items-center gap-1 font-num tabular-nums">
            {ChipIcon && <ChipIcon size={12} aria-hidden="true" />}
            {chip.label}
          </Badge>
        ) : (
          <span className="text-sub text-ink-3">아직 초대하지 않았어요. 링크를 보내면 임차인이 앱에서 계약서를 보고 수리 요청을 보내요.</span>
        )}
        <span className="flex-1" />
        {action && (
          <Button variant={action === 'reissue' ? 'secondary' : 'primary'} size="h44" onClick={onInvite} className="inline-flex shrink-0 items-center gap-1.5">
            {action === 'invite' && <Send size={15} aria-hidden="true" />}
            {ACTION_LABEL[action]}
          </Button>
        )}
      </div>
      {chip.kind === 'ACCEPTED' && accountName && (
        <p className="text-sub text-ink-3">
          앱 계정: <span className="text-ink-2">{accountName}</span> · 수리 요청을 앱으로 받아요
        </p>
      )}
      {chip.kind === 'ACCEPTED' && isAccountNameDifferent(accountName, contract.tenantName) && (
        <p className="flex items-center gap-1.5 text-sub text-warn-ink">
          <Info size={14} className="shrink-0" aria-hidden="true" />
          앱 계정 이름이 계약의 이름과 달라요
        </p>
      )}
      {showFailureAlert && (
        <p className="flex items-start gap-1.5 rounded-input bg-warn-soft px-3 py-2.5 text-sub text-warn-ink">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          본인 확인이 여러 번 실패했어요. 링크가 다른 사람에게 갔다면 새 링크를 만들어 보세요.
        </p>
      )}
      {invitations.error && <p className="text-sub text-crit-ink">{invitations.error.message}</p>}
    </div>
  );
};

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
// autoInviteContractId: 계약 등록 직후 넘어온 새 계약 id. 그 계약을 불러와 초대 팝업을 A1부터 한 번 띄우고 onAutoInviteHandled로 알린다.
export const PropertyContractArea = ({
  propertyId,
  ownershipId,
  canRegister,
  focusContractId,
  autoInviteContractId,
  onAutoInviteHandled,
  onNavigate,
  onUnauthorized,
}) => {
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
  const [inviteModal, setInviteModal] = useState(null); // { contract, startStep } | null
  const [invitationsReloadKey, setInvitationsReloadKey] = useState(0);

  // 등록 직후 팝업: 갱신 계약(시작 전)은 지금 계약 자리에 안 보일 수 있어 그 계약을 따로 불러온다. 한 번만 띄운다.
  const [pendingAutoInviteId, setPendingAutoInviteId] = useState(autoInviteContractId);
  const autoInviteQuery = useGetContract(pendingAutoInviteId, hookOptions);
  useEffect(() => {
    if (!pendingAutoInviteId || (!autoInviteQuery.data && !autoInviteQuery.error)) return;
    if (autoInviteQuery.data && !autoInviteQuery.data.isReadOnly) setInviteModal({ contract: autoInviteQuery.data, startStep: 'intro' });
    setPendingAutoInviteId(undefined);
    onAutoInviteHandled?.();
  }, [pendingAutoInviteId, autoInviteQuery.data, autoInviteQuery.error, onAutoInviteHandled]);

  const handleInvited = () => {
    currentQuery.refetch();
    setInvitationsReloadKey((prev) => prev + 1);
  };

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
          <TenantInviteStatus
            contract={contract}
            invitationsReloadKey={invitationsReloadKey}
            onInvite={() => setInviteModal({ contract, startStep: 'documents' })}
            onUnauthorized={onUnauthorized}
          />
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
      {inviteModal && (
        <TenantInviteModal
          contract={inviteModal.contract}
          startStep={inviteModal.startStep}
          onClose={() => setInviteModal(null)}
          onInvited={handleInvited}
          onUnauthorized={onUnauthorized}
        />
      )}
    </section>
  );
};
