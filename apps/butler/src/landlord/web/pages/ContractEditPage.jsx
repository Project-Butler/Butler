import { AlertTriangle, FileText } from 'lucide-react';
import { Badge, Button } from '@butler/ui';
import { ContractForm } from '../components/ContractForm/ContractForm';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { FormNoticeStrip, FormPageLayout } from '../components/FormPageLayout/FormPageLayout';
import { FormSummary } from '../components/FormSummary/FormSummary';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetContract } from '../../../shared/useGetContract';
import { useContractEditForm } from '../hooks/useContractEditForm';
import { formatContractAmount, formatPeriod, formatRentPaymentDay, getContractStatusBadge } from '../utils/contract';

// 입력·검증·저장 로직은 useContractEditForm(앱 계약 수정과 같이 씀). 이 화면은 구역 폼·요약 패널 모양만 정한다.
const ContractEditForm = ({ contract, onUnauthorized }) => {
  const title = '계약 수정';
  const { form, updateField, fieldError, lockedFields, isActive, isReady, isSubmitting, hasChanges, save, submitErrorMessage } =
    useContractEditForm({ contract, onUnauthorized });
  const status = getContractStatusBadge(contract);

  const handleSave = async () => {
    if (await save()) window.history.back();
  };

  const isMonthly = form.leaseType === 'MONTHLY';
  const summaryRows = [
    { label: '호실', value: contract.property.displayName, done: true },
    { label: '임차인', value: contract.tenantName, done: true },
    { label: '금액', value: formatContractAmount(contract), done: true },
    { label: '기간', value: formatPeriod(contract), done: true },
    ...(isMonthly
      ? [
          {
            label: '월세 입금일',
            value: form.rentPaymentDay ? formatRentPaymentDay(Number(form.rentPaymentDay)) : '선택해 주세요',
            done: Boolean(form.rentPaymentDay),
          },
        ]
      : []),
  ];

  const actions = (place) => (
    <>
      <Button type="button" variant="secondary" size={place === 'header' ? 'h44' : 'h48'} onClick={() => window.history.back()} disabled={isSubmitting}>
        취소
      </Button>
      <Button type={place === 'footer' ? 'submit' : 'button'} size={place === 'header' ? 'h44' : 'h48'} onClick={place === 'header' ? handleSave : undefined} disabled={!isReady || isSubmitting}>
        {isSubmitting ? '저장 중' : '저장'}
      </Button>
    </>
  );

  return (
    <FormPageLayout
      className="contract-edit-page"
      title={title}
      description={`${contract.property.displayName} · ${contract.tenantName}`}
      actions={actions}
      onSubmit={handleSave}
      notice={
        isActive && (
          <FormNoticeStrip icon={AlertTriangle}>
            진행 중인 계약은 월세 입금일·연락처·메모만 고칠 수 있어요. 조건을 바꾸려면 갱신 계약을 등록하세요.
          </FormNoticeStrip>
        )
      }
      summary={
        <FormSummary icon={FileText} title="수정" rows={summaryRows}>
          {!hasChanges && <p className="text-sub text-ink-3">바꾼 칸이 있어야 저장할 수 있어요.</p>}
          {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}
        </FormSummary>
      }
    >
      <ContractForm
        form={form}
        onChange={updateField}
        fieldError={fieldError}
        disabled={isSubmitting}
        lockedFields={lockedFields}
        propertyField={
          <div className="flex flex-col gap-1.5">
            <p className="text-label font-semibold text-ink">호실</p>
            <p className="flex items-center gap-2 rounded-input bg-surface-2 px-4 py-3 text-card text-ink-2">
              {contract.property.displayName}
              <Badge tone={status.tone}>{status.label}</Badge>
            </p>
            <p className="text-chip text-ink-3">호실은 바꿀 수 없어요. 다른 호실이라면 계약을 새로 등록해 주세요</p>
          </div>
        }
      />
    </FormPageLayout>
  );
};

// 계약 수정(S-04, PATCH /contracts/:contractId). 끝난 계약(isReadOnly)은 수정할 수 없다.
export const ContractEditPage = ({ contractId, onUnauthorized }) => {
  const contractQuery = useGetContract(contractId, { onUnauthorized });
  const contract = contractQuery.data;

  if (contract && !contract.isReadOnly) return <ContractEditForm key={contract.id} contract={contract} onUnauthorized={onUnauthorized} />;

  return (
    <div className="w-full space-y-6 pb-10">
      <PageHeader title="계약 수정" description={contract?.tenantName} />
      {contractQuery.error && <NoticeBox>{contractQuery.error.message}</NoticeBox>}
      {!contract && !contractQuery.error && <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      {contract?.isReadOnly && <NoticeBox tone="warn">끝난 계약이나 소유가 끝난 호실의 계약은 수정할 수 없어요</NoticeBox>}
    </div>
  );
};
