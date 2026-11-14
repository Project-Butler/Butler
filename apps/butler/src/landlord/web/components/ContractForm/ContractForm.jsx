import { Building2, CalendarDays, Coins, StickyNote, User } from 'lucide-react';
import { RequiredMark, SegmentedControl, TextField } from '@butler/ui';
import { FormSection } from '../FormSection/FormSection';
import { formatNumber } from '../../utils/format';
import { toPriceDigits } from '../../utils/formValidation';
import {
  CONTRACT_DATE_MAX,
  CONTRACT_DATE_MIN,
  CONTRACT_DATE_RANGE_MESSAGE,
  formatManwon,
  formatPhone,
  getLeaseTypeLabel,
  isContractDateInRange,
  isValidPhone,
  LEASE_TYPE_OPTIONS,
  RENT_PAYMENT_DAY_OPTIONS,
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
  'rentPaymentDay',
  'startDate',
  'endDate',
  'tenantName',
  'tenantPhone',
  'memo',
  'previousContractId',
];

// 금액은 숫자만(문자열) 들고 있다가 보낼 때 정수로 바꾼다. 연락처도 숫자만. 입금일은 선택 칸 값('1'~'31').
export const EMPTY_CONTRACT_FORM = {
  leaseType: 'MONTHLY',
  deposit: '',
  monthlyRent: '',
  rentPaymentDay: '',
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
  rentPaymentDay: contract.rentPaymentDay == null ? '' : String(contract.rentPaymentDay),
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
  NOT_ALLOWED_FOR_JEONSE: '전세 계약에는 월세 입금일을 넣을 수 없어요.',
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
    startDate: form.startDate && !isContractDateInRange(form.startDate) ? CONTRACT_DATE_RANGE_MESSAGE : undefined,
    endDate:
      form.endDate && !isContractDateInRange(form.endDate)
        ? CONTRACT_DATE_RANGE_MESSAGE
        : form.startDate && form.endDate && form.endDate <= form.startDate
          ? '종료일은 시작일보다 뒤여야 해요.'
          : undefined,
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

// 필수 칸을 다 채웠는지(전세면 월세·입금일 칸은 보지 않음). 입금일은 API에서는 선택이지만 화면에서는 월세면 필수(#76 Q1).
// 입금일이 없던 기존 월세 계약을 수정할 때만 rentPaymentDayOptional로 선택 칸으로 둔다.
export const isContractFormComplete = (form, { rentPaymentDayOptional = false } = {}) =>
  Boolean(
    form.deposit !== '' &&
      (form.leaseType === 'JEONSE' ||
        (form.monthlyRent !== '' && (rentPaymentDayOptional || form.rentPaymentDay !== ''))) &&
      form.startDate &&
      form.endDate &&
      form.tenantName.trim() &&
      form.tenantPhone,
  );

// 서버로 보낼 계약 칸. 전세는 월세 0(R-03), 입금일 null.
export const toContractFields = (form) => ({
  leaseType: form.leaseType,
  deposit: Number(form.deposit),
  monthlyRent: form.leaseType === 'JEONSE' ? 0 : Number(form.monthlyRent),
  rentPaymentDay: form.leaseType === 'JEONSE' || form.rentPaymentDay === '' ? null : Number(form.rentPaymentDay),
  startDate: form.startDate,
  endDate: form.endDate,
  tenantName: form.tenantName.trim(),
  tenantPhone: form.tenantPhone,
  memo: form.memo.trim() || null,
});

// 앱처럼 폭이 좁은 화면: 구역 머리 없이 칸만 위아래로 쌓고, 한 줄은 2칸. 구역 사이 간격은 부모가 준다.
const StackedSection = ({ children }) => children;

// 계약 입력 칸(S-02 ②~⑥, S-04). lockedFields에 든 칸은 보기만 한다(진행 중 계약, D-13).
// layout="sections"(웹, 기본): 구역 폼 — 호실 · 유형 / 금액 / 기간 / 임차인 / 메모. 구역마다 오른쪽은 가로 3칸.
// layout="stacked"(앱): 같은 칸·검증을 한 줄 2칸으로 쌓는다. 월세 입금일·계약 유형은 안내 문구가 잘리지 않게 한 줄 전체.
export const ContractForm = ({ form, onChange, fieldError, disabled = false, lockedFields = [], propertyField = null, layout = 'sections' }) => {
  const isLocked = (name) => disabled || lockedFields.includes(name);
  const isJeonse = form.leaseType === 'JEONSE';
  const moneyHint = (value) => (value ? formatManwon(Number(value)) : undefined);
  const isFullyLocked = ['leaseType', 'deposit', 'startDate', 'tenantName'].every(isLocked);
  const isStacked = layout === 'stacked';
  const Section = isStacked ? StackedSection : FormSection;
  const rowClass = isStacked ? 'grid grid-cols-2 items-start gap-4' : 'grid grid-cols-3 items-start gap-4';
  const fullRow = isStacked ? 'col-span-2' : '';

  return (
    <>
      <Section icon={Building2} title="호실 · 유형" description={isFullyLocked ? '진행 중 계약은 호실·조건을 바꿀 수 없어요' : '인증을 마친 호실만 골라요'}>
        <div className={rowClass}>
          {propertyField && <div className="col-span-2">{propertyField}</div>}
          <div className={`flex flex-col gap-1.5 ${fullRow}`}>
            <p className="text-label font-semibold text-ink">계약 유형</p>
            {isLocked('leaseType') ? (
              <p className="rounded-input bg-surface-2 px-4 py-3 text-card text-ink-2">{getLeaseTypeLabel(form.leaseType)}</p>
            ) : (
              <SegmentedControl
                ariaLabel="계약 유형"
                options={LEASE_TYPE_OPTIONS}
                value={form.leaseType}
                onChange={(value) => {
                  onChange('leaseType', value);
                  // 전세는 입금일이 없다. 칸을 숨기면서 값도 비운다.
                  if (value === 'JEONSE') onChange('rentPaymentDay', '');
                }}
              />
            )}
          </div>
        </div>
      </Section>
      <Section icon={Coins} title="금액" description="숫자만 입력하면 단위가 붙어요">
        <div className={rowClass}>
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
          {!isJeonse && (
            <div className={`flex flex-col gap-1.5 ${fullRow}`}>
              <label htmlFor="contract-rent-payment-day" className="text-label font-semibold text-ink">
                월세 입금일
                <RequiredMark />
              </label>
              <select
                id="contract-rent-payment-day"
                aria-required="true"
                value={form.rentPaymentDay}
                onChange={(event) => onChange('rentPaymentDay', event.target.value)}
                disabled={isLocked('rentPaymentDay')}
                className="h-12 rounded-input border border-line bg-surface px-3 font-num text-card tabular-nums text-ink outline-none focus:border-accent disabled:bg-surface-2"
              >
                <option value="" disabled>
                  매월 며칠인지 선택해 주세요
                </option>
                {RENT_PAYMENT_DAY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    매월 {label}
                  </option>
                ))}
              </select>
              {fieldError('rentPaymentDay') ? (
                <p className="text-chip text-crit-ink">{fieldError('rentPaymentDay')}</p>
              ) : (
                <p className="text-chip text-ink-3">29~31일이 없는 달은 그달 말일로 계산해요</p>
              )}
            </div>
          )}
        </div>
      </Section>
      <Section icon={CalendarDays} title="기간" description="종료일은 시작일보다 뒤여야 해요">
        <div className={rowClass}>
          <TextField
            label="시작일"
            required
            type="date"
            className="font-num tabular-nums"
            min={CONTRACT_DATE_MIN}
            max={CONTRACT_DATE_MAX}
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
            min={CONTRACT_DATE_MIN}
            max={CONTRACT_DATE_MAX}
            value={form.endDate}
            onChange={(event) => onChange('endDate', event.target.value)}
            error={fieldError('endDate')}
            disabled={isLocked('endDate')}
          />
        </div>
      </Section>
      <Section icon={User} title="임차인" description="연락처는 010으로 시작해요">
        <div className={rowClass}>
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
      </Section>
      <Section icon={StickyNote} title="메모" description="특약·관리비 등">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contract-memo" className="text-label font-semibold text-ink">
            메모 (선택)
          </label>
          <textarea
            id="contract-memo"
            rows={3}
            maxLength={MAX_MEMO_LENGTH}
            placeholder="특약, 관리비 등 기억해 둘 내용"
            value={form.memo}
            onChange={(event) => onChange('memo', event.target.value)}
            disabled={isLocked('memo')}
            className="rounded-input border border-line bg-surface px-4 py-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-3"
          />
          {fieldError('memo') && <p className="text-chip text-crit-ink">{fieldError('memo')}</p>}
        </div>
      </Section>
    </>
  );
};
