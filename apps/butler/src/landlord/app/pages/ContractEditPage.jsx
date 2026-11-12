import { Badge, Button, MobileFormLayout } from '@butler/ui';
import { useGetContract } from '../../../shared/useGetContract';
import { ContractForm } from '../../web/components/ContractForm/ContractForm';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useContractEditForm } from '../../web/hooks/useContractEditForm';
import { getContractStatusBadge } from '../../web/utils/contract';
import { useGoBack } from '../utils/navigation';

const CARD_CLASS = 'flex flex-col gap-6 rounded-card border border-line bg-surface p-4';

const ContractEditForm = ({ contract, onUnauthorized, goBack }) => {
  const { form, updateField, fieldError, lockedFields, isActive, isReady, isSubmitting, save, submitErrorMessage } =
    useContractEditForm({ contract, onUnauthorized });
  const status = getContractStatusBadge(contract);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (await save()) goBack();
  };

  return (
    <MobileFormLayout
      shell="landlord-app-form"
      topBar={{ title: '계약 수정', onBack: goBack }}
      onSubmit={handleSubmit}
      cta={
        <>
          <Button type="button" variant="secondary" size="h52" onClick={goBack} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="submit" size="h52" className="flex-1" disabled={!isReady || isSubmitting}>
            {isSubmitting ? '저장 중' : '저장'}
          </Button>
        </>
      }
    >
      <p className="text-m-sub text-ink-3">{contract.tenantName}</p>
      <section aria-label="계약 수정" className={CARD_CLASS}>
        <div className="flex flex-col gap-1.5">
          <p className="text-label font-semibold text-ink">호실</p>
          <p className="flex flex-wrap items-center gap-2 rounded-input bg-surface-2 px-4 py-3 text-card text-ink-2">
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

        <ContractForm form={form} onChange={updateField} fieldError={fieldError} disabled={isSubmitting} lockedFields={lockedFields} fullWidthRentDay />

        {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}
      </section>
    </MobileFormLayout>
  );
};

// 임대인 앱 계약 수정 (S-04, PATCH /contracts/:contractId). 웹 계약 수정과 같은 입력 칸·검증·API(useContractEditForm)를 쓰고,
// 하단 탭 대신 하단 고정 버튼 칸에 [취소]·[저장]을 둔다. 저장하거나 취소하면 이전 화면(계약 관리)으로 돌아간다.
// 끝난 계약(isReadOnly)은 수정할 수 없다.
export const ContractEditPage = ({ contractId, onUnauthorized }) => {
  const goBack = useGoBack('contractDetail', { contractId });
  const { data: contract, error } = useGetContract(contractId, { onUnauthorized });

  if (contract && !contract.isReadOnly) {
    return <ContractEditForm key={contract.id} contract={contract} onUnauthorized={onUnauthorized} goBack={goBack} />;
  }

  return (
    <MobileFormLayout shell="landlord-app-form" topBar={{ title: '계약 수정', onBack: goBack }}>
      {contract?.isReadOnly && <NoticeBox tone="warn">끝난 계약이나 소유가 끝난 호실의 계약은 수정할 수 없어요</NoticeBox>}
      {!contract && error && <NoticeBox>{error.message}</NoticeBox>}
      {!contract && !error && (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}
    </MobileFormLayout>
  );
};
