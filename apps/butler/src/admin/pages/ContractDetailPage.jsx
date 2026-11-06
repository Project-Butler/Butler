import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card } from '@butler/ui';
import { ChevronLeft } from 'lucide-react';
import { StatusMessage } from '../components/StatusMessage/StatusMessage';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE, LEASE_TYPE_LABEL } from '../constants/labels';
import { useGetContract } from '../../shared/useGetContract';
import { formatDateTime } from '../utils/formatDate';
import { formatWon } from '../utils/formatMoney';

const InfoRow = ({ label, children }) => (
  <div className="flex gap-4 py-2">
    <dt className="w-28 shrink-0 text-chip font-medium text-ink-3">{label}</dt>
    <dd className="min-w-0 text-body text-ink">{children ?? '-'}</dd>
  </div>
);

// 계약 상세(읽기 전용). 운영자는 계약을 건별로만 보고, 수정·해지하지 않는다.
// 어떤 칸을 보여 줄지는 서버(contractSerializer)가 정한다. 값이 null이거나 가려져 와도 '-'나 받은 값 그대로 보여 준다.
export const ContractDetailPage = ({ onNavigate, onUnauthorized }) => {
  const { contractId } = useParams();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { data: contract, error, isLoading, refetch } = useGetContract(contractId, { onUnauthorized });

  // 다른 화면에서 왔으면 뒤로 가고, 주소로 바로 들어왔으면 계약 찾기 화면으로 보낸다.
  const goBack = () => (location.key === 'default' ? onNavigate('contracts') : routerNavigate(-1));
  const openAuditLogs = () =>
    onNavigate('auditLogs', undefined, `?${new URLSearchParams({ resourceType: 'CONTRACT', resourceId: contractId })}`);

  return (
    <div className="space-y-4">
      <button type="button" onClick={goBack} className="flex items-center gap-1 text-body text-ink-2 hover:text-ink">
        <ChevronLeft size={18} aria-hidden="true" />
        뒤로
      </button>

      {error && (
        <Card className="p-5">
          <StatusMessage tone="error" onRetry={error.code === 'CONTRACT_NOT_FOUND' ? undefined : refetch}>
            {error.message}
          </StatusMessage>
        </Card>
      )}
      {isLoading && !contract && <StatusMessage>불러오는 중입니다</StatusMessage>}

      {contract && (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-h1 font-bold text-ink">{contract.property?.displayName ?? '-'}</h2>
                <Badge tone={CONTRACT_STATUS_TONE[contract.status]}>{CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}</Badge>
              </div>
              <p className="mt-1 font-num text-chip text-ink-3">{contract.id}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={openAuditLogs}>
              이 계약의 감사 로그
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-body font-semibold text-ink">계약 조건</h3>
              <dl className="mt-2 divide-y divide-line">
                <InfoRow label="유형">{LEASE_TYPE_LABEL[contract.leaseType] ?? contract.leaseType}</InfoRow>
                <InfoRow label="보증금">
                  <span className="font-num">{formatWon(contract.deposit)}</span>
                </InfoRow>
                {contract.leaseType !== 'JEONSE' && (
                  <InfoRow label="월세">
                    <span className="font-num">{formatWon(contract.monthlyRent)}</span>
                  </InfoRow>
                )}
                <InfoRow label="기간">
                  <span className="whitespace-nowrap font-num">
                    {contract.startDate ?? '-'} ~ {contract.endDate ?? '-'}
                  </span>
                  {/* 공백을 두어 폭이 좁으면 D-day가 통째로 다음 줄로 내려가게 한다 */}
                  {contract.daysUntilEnd != null && (
                    <>
                      {' '}
                      <span className="ml-1 whitespace-nowrap text-chip text-ink-3">D-{contract.daysUntilEnd}</span>
                    </>
                  )}
                </InfoRow>
                {contract.terminatedOn && (
                  <>
                    <InfoRow label="해지일">
                      <span className="font-num">{contract.terminatedOn}</span>
                    </InfoRow>
                    <InfoRow label="해지 사유">{contract.terminationReason}</InfoRow>
                  </>
                )}
                <InfoRow label="이전 계약">
                  {contract.previousContractId && (
                    <button
                      type="button"
                      onClick={() => onNavigate('contractDetail', { contractId: contract.previousContractId })}
                      className="font-num text-chip text-accent hover:underline"
                    >
                      {contract.previousContractId}
                    </button>
                  )}
                </InfoRow>
              </dl>
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <h3 className="text-body font-semibold text-ink">임대인</h3>
                <dl className="mt-2 divide-y divide-line">
                  <InfoRow label="이름">
                    {contract.landlord && (
                      <button
                        type="button"
                        onClick={() => onNavigate('userDetail', { userId: contract.landlord.id })}
                        className="text-accent hover:underline"
                      >
                        {contract.landlord.name}
                      </button>
                    )}
                  </InfoRow>
                  <InfoRow label="권리자 인증">{contract.landlordVerified ? '인증 완료' : '미인증'}</InfoRow>
                </dl>
              </Card>

              <Card className="p-5">
                <h3 className="text-body font-semibold text-ink">임차인</h3>
                <dl className="mt-2 divide-y divide-line">
                  <InfoRow label="이름">{contract.tenant?.name}</InfoRow>
                  <InfoRow label="연락처">
                    {contract.tenant?.phone && <span className="font-num">{contract.tenant.phone}</span>}
                  </InfoRow>
                  <InfoRow label="버틀러 계정">{contract.tenant?.userId ? '연결됨' : '연결 안 됨'}</InfoRow>
                </dl>
              </Card>
            </div>
          </div>

          <p className="text-chip text-ink-3">
            등록 {formatDateTime(contract.createdAt)} · 마지막 수정 {formatDateTime(contract.updatedAt)}
          </p>
        </>
      )}
    </div>
  );
};
