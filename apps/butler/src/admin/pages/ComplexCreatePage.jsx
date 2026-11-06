import { useState } from 'react';
import { Button, Card } from '@butler/ui';
import { usePostAdminComplex } from '../hooks/usePostAdminComplex';
import { toFieldErrors } from '../utils/apiError';

const inputClass =
  'h-11 w-full rounded-input border bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent';

const EMPTY_FORM = { name: '', legalDongCode: '', roadAddress: '', jibunAddress: '', sourceKey: '' };

// 입력 칸. 서버 검증 오류(details)는 해당 칸 아래에 보여 준다.
const FIELDS = [
  { key: 'name', label: '단지명', placeholder: '예: 중계OO아파트', maxLength: 100, required: true },
  { key: 'legalDongCode', label: '법정동코드', placeholder: '10자리 숫자 (예: 1135010600)', maxLength: 10, required: true, inputMode: 'numeric' },
  { key: 'roadAddress', label: '도로명주소', placeholder: '서울특별시 노원구 OO로 00', maxLength: 200 },
  { key: 'jibunAddress', label: '지번주소', placeholder: '서울특별시 노원구 중계동 00', maxLength: 200 },
  { key: 'sourceKey', label: 'sourceKey (선택)', placeholder: '비우면 자동으로 만듭니다', maxLength: 100 },
];

// 빈 칸은 보내지 않는다(서버가 null로 처리).
const toBody = (form) => Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim() !== ''));

// 단지 직접 등록. 주소 검색(juso)에 나오지 않는 단지만 여기서 만든다(api-contract.md 8장).
export const ComplexCreatePage = ({ onUnauthorized }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState(null);
  const create = usePostAdminComplex({ onUnauthorized });
  const fieldErrors = toFieldErrors(create.error);

  const setValue = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setCreated(null);
    const { data } = await create.mutate(toBody(form));
    if (data) {
      setCreated(data);
      setForm(EMPTY_FORM);
    }
  };

  // 칸별 오류가 없는 오류(409·404 등)만 폼 아래에 한 줄로 보여 준다.
  const formError = create.error && Object.keys(fieldErrors).length === 0 ? create.error.message : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h1 font-bold text-ink">단지 등록</h2>
        <p className="mt-1 text-body text-ink-2">
          주소 검색에 나오지 않는 단지를 직접 등록합니다. 등록 기록은 감사 로그에 남습니다.
        </p>
      </div>

      <Card className="max-w-2xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1.5">
              <span className="text-label font-semibold text-ink">
                {field.label}
                {field.required && <span className="text-crit-ink"> *</span>}
              </span>
              <input
                value={form[field.key]}
                onChange={setValue(field.key)}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                inputMode={field.inputMode}
                aria-invalid={fieldErrors[field.key] ? true : undefined}
                className={`${inputClass} ${fieldErrors[field.key] ? 'border-crit' : 'border-line'}`}
              />
              {fieldErrors[field.key] && <span className="text-chip text-crit-ink">{fieldErrors[field.key]}</span>}
            </label>
          ))}
          <p className="text-chip text-ink-3">도로명주소와 지번주소 중 하나는 입력해야 합니다.</p>

          {formError && (
            <p role="alert" className="rounded-btn bg-crit-soft px-4 py-3 text-body text-crit-ink">
              {formError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={create.isLoading}>
              {create.isLoading ? '등록 중…' : '단지 등록'}
            </Button>
          </div>
        </form>
      </Card>

      {created && (
        <Card className="max-w-2xl space-y-2 p-5">
          <p role="status" className="text-body font-semibold text-ok-ink">
            단지를 등록했습니다.
          </p>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-body">
            <dt className="text-ink-3">단지명</dt>
            <dd className="text-ink">{created.name}</dd>
            <dt className="text-ink-3">지역</dt>
            <dd className="text-ink">{created.region.fullName}</dd>
            <dt className="text-ink-3">주소</dt>
            <dd className="text-ink">{created.roadAddress ?? created.jibunAddress}</dd>
            <dt className="text-ink-3">sourceKey</dt>
            <dd className="break-all text-ink">{created.sourceKey}</dd>
            <dt className="text-ink-3">단지 ID</dt>
            <dd className="break-all text-ink">{created.id}</dd>
          </dl>
        </Card>
      )}
    </div>
  );
};
