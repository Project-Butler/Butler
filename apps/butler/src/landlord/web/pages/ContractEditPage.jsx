import { Badge, Button, Card } from '@butler/ui';
import { ContractForm } from '../components/ContractForm/ContractForm';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useGetContract } from '../../../shared/useGetContract';
import { useContractEditForm } from '../hooks/useContractEditForm';
import { getContractStatusBadge } from '../utils/contract';

const ContractEditForm = ({ contract, onUnauthorized }) => {
  const { form, updateField, fieldError, lockedFields, isActive, isReady, isSubmitting, save, submitErrorMessage } =
    useContractEditForm({ contract, onUnauthorized });
  const status = getContractStatusBadge(contract);

  const handleSave = async (event) => {
    event?.preventDefault();
    if (await save()) window.history.back();
  };

  return (
    <form onSubmit={handleSave} className="w-full max-w-4xl">
      <Card className="space-y-6 p-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-label font-semibold text-ink">호실</p>
          <p className="flex items-center gap-2 rounded-input bg-surface-2 px-4 py-3 text-card text-ink-2">
            {contract.property.displayName}
            <Badge tone={status.tone}>{status.label}</Badge>
          </p>
          <p className="text-chip text-ink-3">호실은 바꿀 수 없어요. 다른 호실이라면 계약을 새로 등록해 주세요</p>
        </div>

        {isActive && (
          <NoticeBox tone="warn">
            진행 중인 계약은 월세 입금일·연락처·메모만 바꿀 수 있어요. 다른 조건은 해지 후 새로 등록하거나 갱신하세요
          </NoticeBox>
        )}

        <ContractForm
          form={form}
          onChange={updateField}
          fieldError={fieldError}
          disabled={isSubmitting}
          lockedFields={lockedFields}
        />

        {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}

        <div className="flex justify-end gap-3 border-t border-line pt-5">
          <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="submit" disabled={!isReady || isSubmitting}>
            {isSubmitting ? '저장 중' : '저장'}
          </Button>
        </div>
      </Card>
    </form>
  );
};

// 계약 수정(S-04, PATCH /contracts/:contractId). 끝난 계약(isReadOnly)은 수정할 수 없다.
export const ContractEditPage = ({ contractId, onUnauthorized }) => {
  const contractQuery = useGetContract(contractId, { onUnauthorized });
  const contract = contractQuery.data;

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="계약 수정" description={contract?.tenantName} onBack={() => window.history.back()} />
      {contractQuery.error && <NoticeBox>{contractQuery.error.message}</NoticeBox>}
      {!contract && !contractQuery.error && <p className="py-10 text-center text-body text-ink-3">불러오는 중입니다</p>}
      {contract?.isReadOnly && <NoticeBox tone="warn">끝난 계약이나 소유가 끝난 호실의 계약은 수정할 수 없어요</NoticeBox>}
      {contract && !contract.isReadOnly && (
        <ContractEditForm key={contract.id} contract={contract} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
};
