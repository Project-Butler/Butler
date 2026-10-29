import { SegmentedControl, TextField } from '@butler/ui';
import { formatNumber } from '../../utils/format';
import { toPriceDigits } from '../../utils/formValidation';
import {
  formatManwon,
  formatPhone,
  getLeaseTypeLabel,
  isValidPhone,
  LEASE_TYPE_OPTIONS,
  toPhoneDigits,
} from '../../utils/contract';

// 서버 검증(apps/api contracts controller)과 같은 범위
export const MAX_TENANT_NAME_LENGTH = 30;
export const MAX_MEMO_LENGTH = 1000;

// 서버 400 details.field 중 이 폼의 칸 아래에 보여 줄 것(previousContractId는 시작일 칸에)
export const CONTRACT_FORM_FIELDS = [
  'leaseType',
  'deposit',
  'monthlyRent',
  'startDate',
  'endDate',
  'tenantName',
  'tenantPhone',
  'memo',
  'previousContractId',
];

// 금액은 숫자만(문자열) 들고 있다가 보낼 때 정수로 바꾼다. 연락처도 숫자만.
export const EMPTY_CONTRACT_FORM = {
  leaseType: 'MONTHLY',
  deposit: '',
  monthlyRent: '',
  startDate: '',
  endDate: '',
  tenantName: '',
  tenantPhone: '',
  memo: '',
};

export const toContractForm = (contract) => ({
  leaseType: contract.leaseType,
  deposit: String(contract.deposit),
  monthlyRent: contract.leaseType === 'JEONSE' ? '' : String(contract.monthlyRent),
  startDate: contract.startDate,
  endDate: contract.endDate,
  tenantName: contract.tenantName,
  tenantPhone: toPhoneDigits(contract.tenant?.phone),
  memo: contract.memo ?? '',
});

// 서버 details.reason 중 코드로 오는 것 → 화면 문구
const SERVER_REASON_MESSAGE = {
  INVALID_PHONE: '010으로 시작하는 휴대폰 번호를 입력해 주세요.',
  INVALID_PREVIOUS_CONTRACT: '시작일은 이전 계약이 끝난 날 이후여야 해요.',
};

// 이전 계약 연결 오류(D-05)는 시작일을 고치면 풀리므로 시작일 칸 아래에 보여 준다.
const FIELD_ALIAS = { previousContractId: 'startDate' };

export const toServerFieldErrors = (apiError) =>
  Object.fromEntries(
    (apiError?.details ?? []).map(({ field, reason }) => [FIELD_ALIAS[field] ?? field, SERVER_REASON_MESSAGE[reason] ?? reason]),
  );

// 입력 중인 값의 형식 오류(빈 칸은 검사하지 않음 — 필수는 버튼 활성으로 표시)
export const validateContractForm = (form) => {
  const errors = {
    tenantName:
      form.tenantName.trim().length > MAX_TENANT_NAME_LENGTH ? `${MAX_TENANT_NAME_LENGTH}자 이하로 입력해 주세요.` : undefined,
    tenantPhone: form.tenantPhone && !isValidPhone(form.tenantPhone) ? SERVER_REASON_MESSAGE.INVALID_PHONE : undefined,
    endDate:
      form.startDate && form.endDate && form.endDate <= form.startDate ? '종료일은 시작일보다 뒤여야 해요.' : undefined,
    deposit:
      form.leaseType === 'JEONSE' && form.deposit !== '' && Number(form.deposit) === 0
        ? '전세는 보증금을 입력해 주세요.'
        : form.deposit && !Number.isSafeInteger(Number(form.deposit))
          ? '금액을 다시 확인해 주세요.'
          : undefined,
    monthlyRent:
      form.leaseType === 'MONTHLY' && form.monthlyRent !== '' && Number(form.monthlyRent) === 0
        ? '월세는 1원 이상 입력해 주세요.'
        : form.monthlyRent && !Number.isSafeInteger(Number(form.monthlyRent))
          ? '금액을 다시 확인해 주세요.'
          : undefined,
    memo: form.memo.length > MAX_MEMO_LENGTH ? `${MAX_MEMO_LENGTH}자 이하로 입력해 주세요.` : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
};

// 필수 칸을 다 채웠는지(전세면 월세 칸은 보지 않음)
export const isContractFormComplete = (form) =>
  Boolean(
    form.deposit !== '' &&
      (form.leaseType === 'JEONSE' || form.monthlyRent !== '') &&
      form.startDate &&
      form.endDate &&
      form.tenantName.trim() &&
      form.tenantPhone,
  );

// 서버로 보낼 계약 칸. 전세는 월세 0(R-03).
export const toContractFields = (form) => ({
  leaseType: form.leaseType,
  deposit: Number(form.deposit),
  monthlyRent: form.leaseType === 'JEONSE' ? 0 : Number(form.monthlyRent),
  startDate: form.startDate,
  endDate: form.endDate,
  tenantName: form.tenantName.trim(),
  tenantPhone: form.tenantPhone,
  memo: form.memo.trim() || null,
});

// 계약 입력 칸(S-02 ②~⑥, S-04). lockedFields에 든 칸은 보기만 한다(진행 중 계약, D-13).
export const ContractForm = ({ form, onChange, fieldError, disabled = false, lockedFields = [] }) => {
  const isLocked = (name) => disabled || lockedFields.includes(name);
  const isJeonse = form.leaseType === 'JEONSE';
  const moneyHint = (value) => (value ? formatManwon(Number(value)) : undefined);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <p className="text-label font-semibold text-ink">계약 유형</p>
        {isLocked('leaseType') ? (
          <p className="rounded-input bg-surface-2 px-4 py-3 text-card text-ink-2">{getLeaseTypeLabel(form.leaseType)}</p>
        ) : (
          <SegmentedControl
            ariaLabel="계약 유형"
            className="w-60"
            options={LEASE_TYPE_OPTIONS}
            value={form.leaseType}
            onChange={(value) => onChange('leaseType', value)}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="보증금"
          required
          numeric
          suffix="원"
          placeholder="50,000,000"
          value={form.deposit ? formatNumber(form.deposit) : ''}
          onChange={(event) => onChange('deposit', toPriceDigits(event.target.value))}
          error={fieldError('deposit')}
          hint={moneyHint(form.deposit)}
          disabled={isLocked('deposit')}
        />
        {!isJeonse && (
          <TextField
            label="월세"
            required
            numeric
            suffix="원"
            placeholder="500,000"
            value={form.monthlyRent ? formatNumber(form.monthlyRent) : ''}
            onChange={(event) => onChange('monthlyRent', toPriceDigits(event.target.value))}
            error={fieldError('monthlyRent')}
            hint={moneyHint(form.monthlyRent)}
            disabled={isLocked('monthlyRent')}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="시작일"
          required
          type="date"
          className="font-num tabular-nums"
          value={form.startDate}
          onChange={(event) => onChange('startDate', event.target.value)}
          error={fieldError('startDate')}
          disabled={isLocked('startDate')}
        />
        <TextField
          label="종료일"
          required
          type="date"
          className="font-num tabular-nums"
          min={form.startDate || undefined}
          value={form.endDate}
          onChange={(event) => onChange('endDate', event.target.value)}
          error={fieldError('endDate')}
          disabled={isLocked('endDate')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="임차인 이름"
          required
          maxLength={MAX_TENANT_NAME_LENGTH}
          placeholder="홍길동"
          value={form.tenantName}
          onChange={(event) => onChange('tenantName', event.target.value)}
          error={fieldError('tenantName')}
          disabled={isLocked('tenantName')}
        />
        <TextField
          label="임차인 연락처"
          required
          numeric
          type="tel"
          inputMode="numeric"
          placeholder="010-1234-5678"
          value={formatPhone(form.tenantPhone)}
          onChange={(event) => onChange('tenantPhone', toPhoneDigits(event.target.value))}
          error={fieldError('tenantPhone')}
          disabled={isLocked('tenantPhone')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contract-memo" className="text-label font-semibold text-ink">
          메모 (선택)
        </label>
        <textarea
          id="contract-memo"
          rows={4}
          maxLength={MAX_MEMO_LENGTH}
          placeholder="특약, 관리비 등 기억해 둘 내용"
          value={form.memo}
          onChange={(event) => onChange('memo', event.target.value)}
          disabled={isLocked('memo')}
          className="rounded-input border border-line bg-surface px-4 py-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-3"
        />
        {fieldError('memo') && <p className="text-chip text-crit-ink">{fieldError('memo')}</p>}
      </div>
    </>
  );
};
