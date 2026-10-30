import { useState } from 'react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetContract } from '../hooks/useGetContract';
import { usePostContractTermination } from '../hooks/usePostContractTermination';
import { formatDateKST } from '../utils/format';
import {
  CONTRACT_DATE_MIN,
  CONTRACT_DATE_RANGE_MESSAGE,
  formatPeriod,
  formatPhone,
  formatWon,
  getContractDdayBadge,
  getContractStatusBadge,
  getLeaseTypeLabel,
  getMaxTerminationDate,
  isContractDateInRange,
  isContractInProgress,
} from '../utils/contract';

// 서버 검증(apps/api contracts controller)과 같은 범위
const MAX_REASON_LENGTH = 200;

const InfoRow = ({ label, children, numeric = false }) => (
  <div className="flex gap-4 border-b border-line py-3 last:border-b-0">
    <dt className="w-28 shrink-0 text-sub text-ink-3">{label}</dt>
    <dd className={`min-w-0 flex-1 text-body text-ink ${numeric ? 'font-num tabular-nums' : ''}`}>{children}</dd>
  </div>
);

// 해지(S-05): [해지하기] → 해지일·사유 + 안내 → [취소]·[해지] 2단계(BuildingEditPage 건물 삭제와 같은 방식, 빨강 없음).
// 해지일은 오늘과 종료일 중 이른 날까지(D-15). 시작 전 계약은 시작일 전으로 해지하면 취소와 같다.
const TerminationCard = ({ contract, onTerminated, onUnauthorized }) => {
  const terminate = usePostContractTermination({ onUnauthorized });
  const maxDate = getMaxTerminationDate(contract.endDate);
  const [isConfirming, setIsConfirming] = useState(false);
  const [terminatedOn, setTerminatedOn] = useState(maxDate);
  const [reason, setReason] = useState('');

  const dateError = !terminatedOn
    ? '해지일을 입력해 주세요.'
    : !isContractDateInRange(terminatedOn)
      ? CONTRACT_DATE_RANGE_MESSAGE
      : terminatedOn > maxDate
        ? '해지일은 오늘과 종료일 중 이른 날까지 고를 수 있어요.'
        : undefined;

  const handleTerminate = async () => {
    if (dateError) return;
    const { data } = await terminate.terminateContract(contract.id, { terminatedOn, reason: reason.trim() || null });
    if (data) {
      setIsConfirming(false);
      onTerminated();
    }
  };

  return (
    <Card className="space-y-3 p-6">
      <h2 className="text-section font-semibold text-ink">계약 해지</h2>
      {isConfirming ? (
        <>
          <TextField
            label="해지일"
            required
            type="date"
            className="font-num tabular-nums"
            min={CONTRACT_DATE_MIN}
            max={maxDate}
            value={terminatedOn}
            onChange={(event) => setTerminatedOn(event.target.value)}
            error={dateError}
            disabled={terminate.isLoading}
          />
          <TextField
            label="사유 (선택)"
            placeholder="예: 임차인 요청으로 조기 해지"
            maxLength={MAX_REASON_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={terminate.isLoading}
          />
          <p className="text-sub text-ink-2">이 계약을 해지할까요? 해지한 계약은 되돌리거나 수정할 수 없어요.</p>
          {terminate.error && <NoticeBox>{terminate.error.message}</NoticeBox>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsConfirming(false)} disabled={terminate.isLoading}>
              취소
            </Button>
            <Button onClick={handleTerminate} disabled={Boolean(dateError) || terminate.isLoading}>
              {terminate.isLoading ? '해지 중' : '해지'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sub text-ink-3">잘못 등록한 계약도 해지로 정리해요. 해지일은 오늘 이후로 정할 수 없어요.</p>
          <Button
            variant="secondary"
            onClick={() => {
              terminate.reset();
              setTerminatedOn(maxDate);
              setIsConfirming(true);
            }}
          >
            해지하기
          </Button>
        </>
      )}
    </Card>
  );
};

// 계약 상세(S-03). 수정·해지·갱신 버튼은 내가 지금 소유한 호실의 끝나지 않은 계약(isReadOnly 아님)에만.
// 임차인 초대 영역은 보류(D-18).
export const ContractDetailPage = ({ contractId, onNavigate, onUnauthorized }) => {
  const contractQuery = useGetContract(contractId, { onUnauthorized });
  const { getPropertyName } = useBuildingNames({ onUnauthorized });
  const contract = contractQuery.data;

  if (!contract) {
    return (
      <div className="w-full max-w-6xl space-y-6 pb-10">
        <PageHeader title="계약 상세" onBack={() => window.history.back()} />
        {contractQuery.error ? (
          <NoticeBox>{contractQuery.error.message}</NoticeBox>
        ) : (
          <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>
        )}
      </div>
    );
  }

  const status = getContractStatusBadge(contract.status);
  const dday = getContractDdayBadge(contract);
  const canEdit = !contract.isReadOnly;
  const canRenew = canEdit && isContractInProgress(contract.status);

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title={getPropertyName(contract.property)}
        description={`${contract.tenantName} · ${getLeaseTypeLabel(contract.leaseType)} 계약`}
        onBack={() => window.history.back()}
        actions={
          canEdit && (
            <>
              <Button variant="secondary" onClick={() => onNavigate('contractEdit', { contractId: contract.id })}>
                수정
              </Button>
              {canRenew && (
                <Button onClick={() => onNavigate('contractRegister', { renewFrom: contract.id })}>갱신 계약 등록</Button>
              )}
            </>
          )
        }
      />

      {contractQuery.error && <NoticeBox>{contractQuery.error.message}</NoticeBox>}

      <div className="grid grid-cols-3 items-start gap-6">
        <Card className="col-span-2 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-section font-semibold text-ink">계약 정보</h2>
            <div className="flex items-center gap-1.5">
              <Badge tone={status.tone}>{status.label}</Badge>
              {dday && (
                <Badge tone={dday.tone} className="font-num tabular-nums">
                  {dday.label}
                </Badge>
              )}
            </div>
          </div>
          <dl className="mt-3">
            <InfoRow label="호실">
              <button
                type="button"
                onClick={() => onNavigate('propertyDetail', { propertyId: contract.property.id })}
                className="text-left font-medium text-ink hover:text-accent-strong"
              >
                {getPropertyName(contract.property)}
              </button>
            </InfoRow>
            <InfoRow label="유형">{getLeaseTypeLabel(contract.leaseType)}</InfoRow>
            <InfoRow label="보증금" numeric>
              {formatWon(contract.deposit)}
            </InfoRow>
            {contract.leaseType === 'MONTHLY' && (
              <InfoRow label="월세" numeric>
                {formatWon(contract.monthlyRent)}
              </InfoRow>
            )}
            <InfoRow label="기간" numeric>
              {formatPeriod(contract)}
            </InfoRow>
            <InfoRow label="임차인">{contract.tenantName}</InfoRow>
            <InfoRow label="연락처" numeric>
              {contract.tenant?.phone ? formatPhone(contract.tenant.phone) : '—'}
            </InfoRow>
            <InfoRow label="메모">
              <span className="whitespace-pre-wrap text-ink-2">{contract.memo || '—'}</span>
            </InfoRow>
            {contract.terminatedOn && (
              <>
                <InfoRow label="해지일" numeric>
                  {contract.terminatedOn}
                </InfoRow>
                <InfoRow label="해지 사유">{contract.terminationReason || '—'}</InfoRow>
              </>
            )}
            {contract.previousContractId && (
              <InfoRow label="이전 계약">
                <button
                  type="button"
                  onClick={() => onNavigate('contractDetail', { contractId: contract.previousContractId })}
                  className="text-left font-medium text-accent hover:text-accent-strong"
                >
                  이전 계약 보기
                </button>
              </InfoRow>
            )}
            <InfoRow label="등록일" numeric>
              {formatDateKST(contract.createdAt)}
            </InfoRow>
          </dl>
        </Card>

        <div className="space-y-6">
          {canEdit && isContractInProgress(contract.status) && (
            <NoticeBox tone="info">진행 중인 계약은 연락처·메모만 고칠 수 있어요. 조건을 바꾸려면 갱신 계약을 등록하세요.</NoticeBox>
          )}
          {canEdit && (
            <TerminationCard contract={contract} onTerminated={contractQuery.refetch} onUnauthorized={onUnauthorized} />
          )}
          {contract.isReadOnly && (
            <p className="text-sub text-ink-3">끝난 계약이나 소유가 끝난 호실의 계약은 보기만 할 수 있어요.</p>
          )}
        </div>
      </div>
    </div>
  );
};
