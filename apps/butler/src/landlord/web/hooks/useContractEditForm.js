import { useState } from 'react';
import {
  CONTRACT_FORM_FIELDS,
  isContractFormComplete,
  toContractFields,
  toContractForm,
  toServerFieldErrors,
  validateContractForm,
} from '../components/ContractForm/ContractForm';
import { isContractInProgress } from '../utils/contract';
import { usePatchContract } from './usePatchContract';

// 진행 중 계약은 연락처·메모·월세 입금일만 바꿀 수 있다(D-13, 서버 contractRules.js와 같은 허용 목록). 나머지 칸은 보기만.
const EDITABLE_WHILE_ACTIVE = ['tenantPhone', 'memo', 'rentPaymentDay'];
const LOCKED_WHILE_ACTIVE = CONTRACT_FORM_FIELDS.filter((field) => !EDITABLE_WHILE_ACTIVE.includes(field));

// 바뀐 칸만 보낸다(PATCH). 진행 중이면 잠긴 칸은 아예 보지 않는다.
const toChangedFields = (original, form, lockedFields) => {
  const before = toContractFields(original);
  const after = toContractFields(form);
  return Object.fromEntries(
    Object.entries(after).filter(([key, value]) => !lockedFields.includes(key) && value !== before[key]),
  );
};

// 계약 수정 폼의 상태·검증·저장(S-04). 웹·앱 계약 수정 화면이 같이 쓴다(모양만 다르다).
// save()는 저장에 성공하면 true를 돌려준다. 저장 뒤 어디로 갈지는 화면이 정한다.
export const useContractEditForm = ({ contract, onUnauthorized }) => {
  const patch = usePatchContract({ onUnauthorized });
  const [original] = useState(() => toContractForm(contract));
  const [form, setForm] = useState(original);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const isActive = isContractInProgress(contract.status);
  const lockedFields = isActive ? LOCKED_WHILE_ACTIVE : [];
  const clientErrors = validateContractForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const changes = toChangedFields(original, form, lockedFields);
  const hasChanges = Object.keys(changes).length > 0;
  const isSubmitting = patch.isLoading;
  // 입금일이 없던 기존 월세 계약은 입금일을 고르지 않아도 수정할 수 있다(전세→월세로 바꾸면 필수).
  const rentPaymentDayOptional = original.leaseType === 'MONTHLY' && original.rentPaymentDay === '';
  const isReady = hasChanges && isContractFormComplete(form, { rentPaymentDayOptional }) && Object.keys(clientErrors).length === 0;

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const save = async () => {
    if (!isReady || isSubmitting) return false;
    const { data, error } = await patch.updateContract(contract.id, changes);
    if (data) return true;
    if (error?.status === 400) setServerFieldErrors(toServerFieldErrors(error));
    return false;
  };

  const submitError = patch.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => CONTRACT_FORM_FIELDS.includes(field));

  return {
    form,
    updateField,
    fieldError,
    lockedFields,
    isActive,
    isReady,
    isSubmitting,
    save,
    // 칸 아래에 붙이지 못한 오류만 폼 아래에 따로 보여 준다.
    submitErrorMessage: submitError && !hasMappedFieldError ? submitError.message : null,
  };
};
