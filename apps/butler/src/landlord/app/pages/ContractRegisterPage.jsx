// Created: 2026-11-24
import { Button, MobileFormLayout, RequiredMark } from '@butler/ui';
import { useGetContract } from '../../../shared/useGetContract';
import { ContractForm } from '../../web/components/ContractForm/ContractForm';
import { ContractOcrFill } from '../../web/components/ContractOcrFill/ContractOcrFill';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { useContractRegisterForm } from '../../web/hooks/useContractRegisterForm';
import { CONTRACT_LEGAL_NOTICE, formatContractAmount, formatPeriod, formatPhone } from '../../web/utils/contract';
import { getPropertyStatusBadge } from '../../web/utils/unitListing';
import { useGoBack, useGoTo } from '../utils/navigation';

const CARD_CLASS = 'flex flex-col gap-6 rounded-card border border-line bg-surface p-4';
const SELECT_CLASS =
  'h-12 w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-3';

const ContractRegisterForm = ({ title, initialPropertyId, previous, goBack, onUnauthorized }) => {
  const goTo = useGoTo();
  const {
    propertyList,
    properties,
    propertyId,
    setPropertyId,
    ownershipId,
    isPropertyMissing,
    form,
    updateField,
    fillFromContract,
    fieldError,
    isReady,
    isSubmitting,
    submit,
    submitErrorMessage,
  } = useContractRegisterForm({ initialPropertyId, previous, onUnauthorized });

  // 등록하면 그 계약의 임차인 초대 화면(M15)으로 간다. 등록 화면 기록은 바꿔서 뒤로 가도 등록 폼이 다시 나오지 않게 한다.
  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await submit();
    if (result) goTo('contractInvite', { contractId: result.contract.id }, { replace: true });
  };

  const propertyField = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="app-contract-property" className="text-m-label font-semibold text-ink">
        호실
        <RequiredMark />
      </label>
      <select
        id="app-contract-property"
        aria-required="true"
        value={propertyId}
        onChange={(event) => setPropertyId(event.target.value)}
        // 갱신은 이전 계약과 같은 소유 관계여야 해서(D-05) 호실을 바꾸지 않는다.
        disabled={Boolean(previous) || !propertyList.data || isSubmitting}
        className={SELECT_CLASS}
      >
        <option value="" disabled>
          {propertyList.data ? '계약할 호실을 선택해 주세요' : '불러오는 중'}
        </option>
        {properties.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName} · {getPropertyStatusBadge(item.status).label}
          </option>
        ))}
      </select>
      {propertyList.error && <p className="text-m-sub text-crit-ink">{propertyList.error.message}</p>}
      {isPropertyMissing && <p className="text-m-sub text-crit-ink">인증 완료된 호실 중에 없어요. 권리자 인증을 먼저 완료해 주세요.</p>}
      {propertyList.data && properties.length === 0 && (
        <p className="text-m-sub text-ink-3">
          계약할 수 있는 호실이 없어요. 호실을 등록하고 권리자 인증을 완료해 주세요.{' '}
          <button type="button" onClick={() => goTo('buildingList')} className="font-medium text-accent">
            내 자산으로 가기
          </button>
        </p>
      )}
    </div>
  );

  return (
    <MobileFormLayout
      shell="landlord-app-form"
      topBar={{ title, onBack: goBack }}
      onSubmit={handleSubmit}
      cta={
        <>
          <Button type="button" variant="secondary" size="h52" onClick={goBack} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="submit" size="h52" className="flex-1" disabled={!isReady || isSubmitting}>
            {isSubmitting ? '등록 중' : '계약 등록'}
          </Button>
        </>
      }
    >
      <p className="text-m-sub text-ink-3">계약 조건과 임차인 연락처를 입력해 주세요. {CONTRACT_LEGAL_NOTICE}.</p>

      {previous && (
        <section aria-label="이전 계약" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <p className="text-m-label font-semibold text-ink">이전 계약</p>
          <p className="font-num text-body tabular-nums text-ink-2">{formatPeriod(previous)}</p>
          <p className="font-num text-m-sub tabular-nums text-ink-3">
            {formatContractAmount(previous)} · {previous.tenantName} {formatPhone(previous.tenant?.phone)}
          </p>
          <NoticeBox tone="info">이전 계약 내용을 채워 뒀어요. 금액과 기간만 확인해 주세요.</NoticeBox>
        </section>
      )}

      <ContractOcrFill ownershipId={ownershipId} form={form} onFill={fillFromContract} disabled={isSubmitting} mobile onUnauthorized={onUnauthorized} />

      <section aria-label={title} className={CARD_CLASS}>
        <ContractForm form={form} onChange={updateField} fieldError={fieldError} disabled={isSubmitting} propertyField={propertyField} layout="stacked" />
        {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}
      </section>
    </MobileFormLayout>
  );
};

// 임대인 앱 계약 등록 (S-02, POST /contracts). 웹 계약 등록과 같은 입력 칸·검증·API(useContractRegisterForm)와
// [계약서로 채우기](B팀 #168)를 쓰고, 하단 탭 대신 하단 고정 버튼 칸에 [취소]·[계약 등록]을 둔다.
// propertyId: 미리 고를 호실(부동산 상세에서), renewFrom: 갱신할 이전 계약 id(D-14, 계약 관리의 [갱신 계약 등록]에서).
// 등록하면 임차인 초대 화면(M15)으로 간다. 취소하면 이전 화면으로, 주소로 바로 들어왔으면 내 자산으로 간다.
export const ContractRegisterPage = ({ propertyId, renewFrom, onUnauthorized }) => {
  const goBack = useGoBack('buildingList');
  const renewQuery = useGetContract(renewFrom, { onUnauthorized });
  const previous = renewQuery.data;
  const title = renewFrom ? '갱신 계약 등록' : '계약 등록';

  if (renewFrom && !previous) {
    return (
      <MobileFormLayout shell="landlord-app-form" topBar={{ title, onBack: goBack }}>
        {renewQuery.error ? (
          <NoticeBox>{renewQuery.error.message}</NoticeBox>
        ) : (
          <p role="status" className="py-10 text-center text-body text-ink-3">
            불러오는 중입니다
          </p>
        )}
      </MobileFormLayout>
    );
  }

  return <ContractRegisterForm title={title} initialPropertyId={propertyId} previous={previous} goBack={goBack} onUnauthorized={onUnauthorized} />;
};
