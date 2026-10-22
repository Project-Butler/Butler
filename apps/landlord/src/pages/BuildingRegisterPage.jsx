import { useCallback, useState } from 'react';
import { CheckCircle2, Circle, MapPin } from 'lucide-react';
import { Button, Card, RequiredMark, TextField } from '@butler/ui';
import { AddressSearchDialog } from '../components/AddressSearchDialog/AddressSearchDialog';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { usePostLandlordBuilding } from '../hooks/usePostLandlordBuilding';
import { toFieldErrors } from '../utils/apiError';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';

// 서버 검증(apps/api landlordBuildings controller)과 같은 범위
const MAX_NAME_LENGTH = 50;
const MAX_MEMO_LENGTH = 500;
// 서버 400 details.field 중 이 화면에 칸이 있는 것
const FORM_FIELDS = ['name', 'complexId', 'memo'];

const EMPTY_FORM = { name: '', memo: '' };

const validateForm = (form) => {
  const errors = {};
  if (form.name.trim().length > MAX_NAME_LENGTH) errors.name = `${MAX_NAME_LENGTH}자 이하로 입력해 주세요.`;
  if (form.memo.trim().length > MAX_MEMO_LENGTH) errors.memo = `${MAX_MEMO_LENGTH}자 이하로 입력해 주세요.`;
  return errors;
};

const toCreateBody = (address, form) => {
  const body = { complexId: address.complexId, name: form.name.trim() };
  if (form.memo.trim()) body.memo = form.memo.trim();
  return body;
};

// complex(resolve 응답) → 화면에 보여 줄 주소
const toAddress = (complex) => ({
  complexId: complex.id,
  roadAddress: complex.roadAddress,
  jibunAddress: complex.jibunAddress,
  zipCode: complex.zipCode,
  dongRange: formatDetailBuildingRange(complex.detailBuildingNames),
});

const AddressField = ({ address, onOpen, error, disabled }) => (
  <div className="flex flex-col gap-1.5">
    <p className="text-label font-semibold text-ink">
      주소
      <RequiredMark />
    </p>
    {address ? (
      <div className="flex items-start justify-between gap-4 rounded-input border border-line px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-card font-medium text-ink">{address.roadAddress ?? address.jibunAddress}</p>
          {address.roadAddress && address.jibunAddress && <p className="text-sub text-ink-2">지번 {address.jibunAddress}</p>}
          <p className="font-num text-sub tabular-nums text-ink-3">
            {[address.zipCode && `우편번호 ${address.zipCode}`, address.dongRange].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onOpen} disabled={disabled}>
          다시 검색
        </Button>
      </div>
    ) : (
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex h-12 items-center gap-2 rounded-input border border-line px-4 text-left text-card text-ink-3 transition-colors hover:border-accent hover:text-ink disabled:opacity-60"
      >
        <MapPin size={18} className="shrink-0" />
        도로명, 건물명, 지번으로 주소를 검색해 주세요
      </button>
    )}
    {error && <p className="text-chip text-crit-ink">{error}</p>}
  </div>
);

const GuideStep = ({ done, title, desc }) => {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex gap-3">
      <Icon size={20} className={`mt-0.5 shrink-0 ${done ? 'text-ok' : 'text-ink-3'}`} aria-hidden="true" />
      <div>
        <p className="text-body font-semibold text-ink">{title}</p>
        <p className="text-sub text-ink-2">{desc}</p>
      </div>
    </li>
  );
};

// 건물 등록(임대인 건물 설정, POST /landlord-buildings) — 한 화면에 한 번에 입력.
// 호실 수는 받지 않는다: 등록한 뒤 건물 상세의 [호실 추가]로 하나씩 늘린다. 저장하면 그 건물의 호실 등록으로 간다.
export const BuildingRegisterPage = ({ onNavigate, onUnauthorized }) => {
  const register = usePostLandlordBuilding({ onUnauthorized });
  const [form, setForm] = useState(EMPTY_FORM);
  const [address, setAddress] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const clientErrors = validateForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const isReady = Boolean(address && form.name.trim()) && Object.keys(clientErrors).length === 0;
  const isSubmitting = register.isLoading;

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  const handleResolved = (complex) => {
    setAddress(toAddress(complex));
    // 건물명이 비어 있으면 건물(단지) 이름으로 채운다.
    setForm((prev) => (prev.name.trim() ? prev : { ...prev, name: complex.name.slice(0, MAX_NAME_LENGTH) }));
    setServerFieldErrors((prev) => ({ ...prev, complexId: undefined, name: undefined }));
    register.reset();
    setIsDialogOpen(false);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!isReady || isSubmitting) return;
    const { data, error } = await register.createBuilding(toCreateBody(address, form));
    if (data) {
      // 등록 화면 기록을 호실 등록으로 바꾼다 → 뒤로가기로 건물 등록이 다시 열리지 않는다.
      onNavigate('propertyRegister', { complexId: data.complex.id }, { replace: true });
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  const submitError = register.error;
  const hasMappedFieldError = submitError?.status === 400 && submitError.details.some(({ field }) => FORM_FIELDS.includes(field));

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="건물 등록" description="건물명과 주소만 입력하면 등록돼요." onBack={() => window.history.back()} />

      <form onSubmit={handleSubmit} className="grid grid-cols-3 items-start gap-6">
        <Card className="col-span-2 space-y-6 p-6">
          <div className="grid grid-cols-2 gap-5">
            <TextField
              label="건물명"
              placeholder="건물명을 입력하세요"
              maxLength={MAX_NAME_LENGTH}
              hint="비워 두면 주소를 고른 뒤 건물 이름으로 대체됩니다."
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              error={fieldError('name')}
              disabled={isSubmitting}
            />
          </div>

          <AddressField
            address={address}
            onOpen={() => setIsDialogOpen(true)}
            error={serverFieldErrors.complexId}
            disabled={isSubmitting}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="building-memo" className="text-label font-semibold text-ink">
              설명 (선택)
            </label>
            <textarea
              id="building-memo"
              rows={4}
              maxLength={MAX_MEMO_LENGTH}
              placeholder="관리에 필요한 메모를 남겨 두세요"
              value={form.memo}
              onChange={(event) => updateField('memo', event.target.value)}
              disabled={isSubmitting}
              className="rounded-input border border-line px-4 py-3 text-card text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            />
            {fieldError('memo') && <p className="text-chip text-crit-ink">{fieldError('memo')}</p>}
          </div>

          {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}

          <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
            {!isReady && <p className="mr-auto text-sub text-ink-3">건물명과 주소를 입력하면 등록할 수 있어요</p>}
            <Button type="button" variant="secondary" onClick={() => window.history.back()} disabled={isSubmitting}>
              취소
            </Button>
            <Button type="submit" disabled={!isReady || isSubmitting}>
              {isSubmitting ? '등록 중' : '건물 등록'}
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-section font-semibold text-ink">등록 순서</h2>
          <ol className="space-y-4">
            <GuideStep done={Boolean(address)} title="주소 찾기" desc="도로명주소 하나가 건물 하나예요" />
            <GuideStep done={false} title="건물 등록" desc="건물명은 내 목록에서만 보여요" />
            <GuideStep done={false} title="호실 추가" desc="등록한 뒤 건물 상세에서 호실을 하나씩 추가해요" />
          </ol>
        </Card>
      </form>

      {isDialogOpen && (
        <AddressSearchDialog onResolved={handleResolved} onClose={closeDialog} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
};
