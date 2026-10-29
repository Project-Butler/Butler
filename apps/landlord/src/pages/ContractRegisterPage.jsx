import { useState } from 'react';
import { Badge, Button, Card, RequiredMark } from '@butler/ui';
import {
  CONTRACT_FORM_FIELDS,
  ContractForm,
  EMPTY_CONTRACT_FORM,
  isContractFormComplete,
  toContractFields,
  toContractForm,
  toServerFieldErrors,
  validateContractForm,
} from '../components/ContractForm/ContractForm';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetContract } from '../hooks/useGetContract';
import { useGetPropertyList } from '../hooks/useGetPropertyList';
import { usePostContract } from '../hooks/usePostContract';
import { formatContractAmount, formatPeriod, formatPhone, getRenewalPeriod } from '../utils/contract';
import { getPropertyStatusBadge } from '../utils/unitListing';

// 호실 선택은 내 활성 소유 호실 전부(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;

// 갱신(D-14): 호실·임차인·유형·금액은 이전 계약 그대로, 기간은 이전 종료일 다음 날부터 2년
const toRenewalForm = (previous) => ({
  ...toContractForm(previous),
  ...getRenewalPeriod(previous.endDate),
  memo: '',
});

const ContractRegisterForm = ({ initialPropertyId, previous, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const propertyList = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const register = usePostContract(hookOptions);
  const { getPropertyName } = useBuildingNames(hookOptions);
  const properties = propertyList.data?.items ?? [];

  const [propertyId, setPropertyId] = useState(previous?.property.id ?? initialPropertyId ?? '');
  const [form, setForm] = useState(() => (previous ? toRenewalForm(previous) : EMPTY_CONTRACT_FORM));
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const property = properties.find((item) => item.id === propertyId);
  const ownershipId = property?.myRelation?.ownershipId;
  const clientErrors = validateContractForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const isSubmitting = register.isLoading;
  const isReady = Boolean(ownershipId) && isContractFormComplete(form) && Object.keys(clientErrors).length === 0;

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const { data, error } = await register.createContract({
      ownershipId,
      ...toContractFields(form),
      previousContractId: previous?.id ?? null,
    });
    // 등록 화면 기록은 상세로 바꾼다(뒤로 가면 다시 등록 폼이 나오지 않게).
    if (data) {
      onNavigate('contractDetail', { contractId: data.id }, { replace: true });
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toServerFieldErrors(error));
  };

  const submitError = register.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => CONTRACT_FORM_FIELDS.includes(field));
  const isPropertyMissing = propertyList.data && propertyId && !property;

  return (
    <div className="grid grid-cols-3 items-start gap-6">
      <Card className="col-span-2 space-y-6 p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contract-property" className="text-label font-semibold text-ink">
            호실
            <RequiredMark />
          </label>
          <select
            id="contract-property"
            aria-required="true"
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            // 갱신은 이전 계약과 같은 소유 관계여야 해서(D-05) 호실을 바꾸지 않는다.
            disabled={Boolean(previous) || !propertyList.data || isSubmitting}
            className="h-12 rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
          >
            <option value="" disabled>
              {propertyList.data ? '계약할 호실을 선택해 주세요' : '불러오는 중'}
            </option>
            {properties.map((item) => (
              <option key={item.id} value={item.id}>
                {getPropertyName(item)} · {getPropertyStatusBadge(item.status).label}
              </option>
            ))}
          </select>
          {propertyList.error && <p className="text-chip text-crit-ink">{propertyList.error.message}</p>}
          {isPropertyMissing && <p className="text-chip text-crit-ink">지금 소유한 호실 중에 없어요. 다시 선택해 주세요.</p>}
          {propertyList.data && properties.length === 0 && (
            <p className="text-chip text-ink-3">먼저 호실을 등록해 주세요</p>
          )}
        </div>

        <ContractForm form={form} onChange={updateField} fieldError={fieldError} disabled={isSubmitting} />
      </Card>

      <Card className="sticky top-6 space-y-4 p-6">
        <h2 className="text-section font-semibold text-ink">등록 요약</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sub text-ink-3">호실</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-body font-semibold text-ink">
              {property ? getPropertyName(property) : '호실을 선택해 주세요'}
              {property && (
                <Badge tone={getPropertyStatusBadge(property.status).tone}>{getPropertyStatusBadge(property.status).label}</Badge>
              )}
            </dd>
          </div>
          {previous && (
            <div>
              <dt className="text-sub text-ink-3">이전 계약</dt>
              <dd className="mt-0.5 font-num text-body tabular-nums text-ink-2">{formatPeriod(previous)}</dd>
              <dd className="font-num text-sub tabular-nums text-ink-3">
                {formatContractAmount(previous)} · {previous.tenantName} {formatPhone(previous.tenant?.phone)}
              </dd>
            </div>
          )}
        </dl>
        {previous && (
          <NoticeBox tone="info">이전 계약 내용을 채워 뒀어요. 금액과 기간만 확인해 주세요.</NoticeBox>
        )}
        {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}
        <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
          {isSubmitting ? '등록 중' : '계약 등록'}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => window.history.back()} disabled={isSubmitting}>
          취소
        </Button>
      </Card>
    </div>
  );
};

// 계약 등록(S-02, POST /contracts). params.propertyId: 미리 고를 호실(공실 행·호실 화면에서),
// params.renewFrom: 갱신할 이전 계약 id(D-14). 저장하면 그 계약 상세로 간다.
export const ContractRegisterPage = ({ params, onNavigate, onUnauthorized }) => {
  const renewQuery = useGetContract(params.renewFrom, { onUnauthorized });
  const previous = renewQuery.data;
  const isWaitingPrevious = Boolean(params.renewFrom) && !previous;

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader
        title={params.renewFrom ? '갱신 계약 등록' : '계약 등록'}
        description="계약 조건과 임차인 연락처를 입력해 주세요."
        onBack={() => window.history.back()}
      />
      {renewQuery.error && <NoticeBox>{renewQuery.error.message}</NoticeBox>}
      {isWaitingPrevious && !renewQuery.error && (
        <p role="status" className="py-10 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}
      {!isWaitingPrevious && (
        <ContractRegisterForm
          initialPropertyId={params.propertyId}
          previous={previous}
          onNavigate={onNavigate}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
};
