// Created: 2026-11-24 15:29
import { useState } from 'react';
import {
  CONTRACT_FORM_FIELDS,
  EMPTY_CONTRACT_FORM,
  isContractFormComplete,
  toContractFields,
  toContractForm,
  toServerFieldErrors,
  validateContractForm,
} from '../components/ContractForm/ContractForm';
import { getRenewalPeriod } from '../utils/contract';
import { useGetPropertyList } from './useGetPropertyList';
import { usePostContract } from './usePostContract';

// 호실 선택은 내 활성 소유 호실 중 인증 완료된 것(목록 API 최대 크기)
const PROPERTY_PICKER_SIZE = 100;

// 갱신(D-14): 호실·임차인·유형·금액은 이전 계약 그대로, 기간은 이전 종료일 다음 날부터 2년
const toRenewalForm = (previous) => ({
  ...toContractForm(previous),
  ...getRenewalPeriod(previous.endDate),
  memo: '',
});

// 계약 등록 폼의 상태·검증·저장(S-02, POST /contracts). 웹·앱 계약 등록 화면이 같이 쓴다(모양만 다르다).
// initialPropertyId: 미리 고를 호실, previous: 갱신할 이전 계약(있으면 호실을 바꾸지 않는다, D-05).
// submit()은 등록에 성공하면 { contract, property }를, 아니면 null을 돌려준다. 등록 뒤 어디로 갈지는 화면이 정한다.
export const useContractRegisterForm = ({ initialPropertyId, previous, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const propertyList = useGetPropertyList({ relation: 'OWNER', size: PROPERTY_PICKER_SIZE }, hookOptions);
  const register = usePostContract(hookOptions);
  const properties = (propertyList.data?.items ?? []).filter((item) => item.myRelation?.verificationStatus === 'VERIFIED');

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

  // [계약서로 채우기](B팀 #168)가 빈 칸을 채운 폼으로 바꾼다. 이전 저장 오류는 지운다.
  const fillFromContract = (nextForm) => {
    setForm(nextForm);
    setServerFieldErrors({});
  };

  const submit = async () => {
    if (!isReady || isSubmitting) return null;
    const { data, error } = await register.createContract({
      ownershipId,
      ...toContractFields(form),
      previousContractId: previous?.id ?? null,
    });
    if (data) return { contract: data, property };
    if (error?.status === 400) setServerFieldErrors(toServerFieldErrors(error));
    return null;
  };

  const submitError = register.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => CONTRACT_FORM_FIELDS.includes(field));

  return {
    propertyList,
    properties,
    propertyId,
    setPropertyId,
    property,
    ownershipId,
    // 고른 호실이 인증 완료 호실 목록에 없다(주소로 다른 호실 id 가 왔을 때).
    isPropertyMissing: Boolean(propertyList.data && propertyId && !property),
    form,
    updateField,
    fillFromContract,
    fieldError,
    isReady,
    isSubmitting,
    submit,
    // 칸 아래에 붙이지 못한 오류만 폼 아래에 따로 보여 준다.
    submitErrorMessage: submitError && !hasMappedFieldError ? submitError.message : null,
  };
};
