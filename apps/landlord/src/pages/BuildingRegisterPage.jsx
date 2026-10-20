import { useCallback, useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button, Card, TextField } from '@butler/ui';
import { AddressSearchDialog } from '../components/AddressSearchDialog/AddressSearchDialog';
import { BottomActionBar } from '../components/BottomActionBar/BottomActionBar';
import { DraftResumeNotice } from '../components/DraftResumeNotice/DraftResumeNotice';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl/SegmentedControl';
import { usePostLandlordBuilding } from '../hooks/usePostLandlordBuilding';
import { toFieldErrors } from '../utils/apiError';
import { clearDraft, readDraft, toDraftKey, writeDraft } from '../utils/draftStorage';
import { REGISTER_MODE_OPTIONS } from '../utils/registerMode';

// 서버 검증(apps/api landlordBuildings controller)과 같은 범위
const MAX_NAME_LENGTH = 50;
const MAX_MEMO_LENGTH = 500;
const MAX_CAPACITY = 999;

// 순서대로 모드 단계: 건물명 → 주소 → 전체 호실 수 → 설명
const STEPS = ['name', 'address', 'capacity', 'memo'];
const STEP_TITLE = {
  name: '건물 이름을 알려 주세요',
  address: '건물 주소를 찾아 주세요',
  capacity: '전체 호실은 몇 개인가요?',
  memo: '건물 설명을 남겨 주세요',
};
// 서버 400 details.field → 그 칸이 있는 단계
const STEP_BY_FIELD = { name: 1, complexId: 2, capacity: 3, memo: 4 };

const EMPTY_FORM = { name: '', capacity: '', memo: '' };

const validateForm = (form) => {
  const errors = {};
  if (form.name.trim().length > MAX_NAME_LENGTH) errors.name = `${MAX_NAME_LENGTH}자 이하로 입력해 주세요.`;
  if (form.capacity && (Number(form.capacity) < 1 || Number(form.capacity) > MAX_CAPACITY)) {
    errors.capacity = `1~${MAX_CAPACITY} 사이로 입력해 주세요.`;
  }
  if (form.memo.trim().length > MAX_MEMO_LENGTH) errors.memo = `${MAX_MEMO_LENGTH}자 이하로 입력해 주세요.`;
  return errors;
};

const toCreateBody = (address, form) => {
  const body = { complexId: address.complexId, name: form.name.trim() };
  if (form.capacity) body.capacity = Number(form.capacity);
  if (form.memo.trim()) body.memo = form.memo.trim();
  return body;
};

// complex(resolve 응답) → 저장·표시용 주소. 임시 저장에는 이 두 칸만 남긴다(토큰 없음).
const toAddress = (complex) => ({
  complexId: complex.id,
  displayAddress: complex.roadAddress ?? complex.jibunAddress ?? complex.name,
});

const AddressField = ({ address, onOpen, error, disabled }) => (
  <div className="flex flex-col gap-1.5">
    <p className="text-label font-semibold text-ink">주소</p>
    {address ? (
      <div className="flex items-center justify-between gap-3 rounded-input border border-line px-3.5 py-3">
        <p className="min-w-0 text-card text-ink">{address.displayAddress}</p>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onOpen} disabled={disabled}>
          다시 검색
        </Button>
      </div>
    ) : (
      <Button variant="secondary" className="h-12 w-full" onClick={onOpen} disabled={disabled}>
        <MapPin size={16} className="-ml-0.5 mr-1.5 inline-block" />
        주소 검색
      </Button>
    )}
    {error && <p className="text-chip text-crit-ink">{error}</p>}
  </div>
);

// 건물 등록(임대인 건물 설정, POST /landlord-buildings). 저장하면 그 건물의 호실 등록으로 간다.
export const BuildingRegisterPage = ({ user, params, onNavigate, onUnauthorized }) => {
  const register = usePostLandlordBuilding({ onUnauthorized });
  const draftKey = toDraftKey(user.id, 'buildingRegister');

  const [pendingDraft, setPendingDraft] = useState(() => readDraft(draftKey));
  const [mode, setMode] = useState(params.mode ?? 'sequential');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [address, setAddress] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const isSequential = mode === 'sequential';
  const currentStep = STEPS[step - 1];
  const clientErrors = validateForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];
  const isReady = Boolean(address && form.name.trim()) && Object.keys(clientErrors).length === 0;
  const isSubmitting = register.isLoading;

  // 순서대로 모드에서만, "이어서 할까요?"에 답한 뒤부터 단계·입력을 임시 저장한다.
  useEffect(() => {
    if (!isSequential || pendingDraft) return;
    if (!address && !form.name && !form.capacity && !form.memo) return;
    writeDraft(draftKey, { mode, step, form, address });
  }, [isSequential, pendingDraft, draftKey, mode, step, form, address]);

  const resumeDraft = () => {
    setMode(pendingDraft.mode ?? 'sequential');
    setStep(pendingDraft.step ?? 1);
    setForm({ ...EMPTY_FORM, ...pendingDraft.form });
    setAddress(pendingDraft.address ?? null);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearDraft(draftKey);
    setPendingDraft(null);
  };

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

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const { data, error } = await register.createBuilding(toCreateBody(address, form));
    if (data) {
      clearDraft(draftKey);
      // 등록 화면 기록을 호실 등록으로 바꾼다 → 뒤로가기로 건물 등록이 다시 열리지 않는다.
      onNavigate('propertyRegister', { complexId: data.complex.id, mode }, { replace: true });
      return;
    }
    if (error?.status === 400) {
      const fieldErrors = toFieldErrors(error);
      setServerFieldErrors(fieldErrors);
      const firstStep = Math.min(...Object.keys(fieldErrors).map((field) => STEP_BY_FIELD[field] ?? STEPS.length));
      if (isSequential && Number.isFinite(firstStep)) setStep(firstStep);
    }
  };

  // 순서대로 모드의 [다음]: 이 단계 칸이 맞아야 넘어간다. 주소 단계는 주소를 골라야 한다.
  const canGoNext = !clientErrors[currentStep] && (currentStep !== 'address' || Boolean(address));

  const submitError = register.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => field in STEP_BY_FIELD);

  const showField = (name) => !isSequential || currentStep === name;

  const goBack = () => {
    if (isSequential && step > 1) {
      setStep(step - 1);
      return;
    }
    window.history.back();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-40">
      <PageHeader
        title="건물 등록"
        onBack={goBack}
        step={isSequential ? step : undefined}
        totalSteps={isSequential ? STEPS.length : undefined}
      />

      {pendingDraft && (
        <DraftResumeNotice
          description={pendingDraft.address?.displayAddress ?? pendingDraft.form?.name}
          onResume={resumeDraft}
          onDiscard={discardDraft}
        />
      )}

      <SegmentedControl label="입력 방식" options={REGISTER_MODE_OPTIONS} value={mode} onChange={setMode} disabled={isSubmitting} />

      <Card className="space-y-5 p-5">
        {isSequential && <h2 className="text-section font-semibold text-ink">{STEP_TITLE[currentStep]}</h2>}

        {showField('name') && (
          <TextField
            label="건물명"
            placeholder="예: 노원 그린아파트"
            maxLength={MAX_NAME_LENGTH}
            hint="비워 두면 주소를 고른 뒤 건물 이름으로 채워요"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            error={fieldError('name')}
            disabled={isSubmitting}
          />
        )}

        {showField('address') && (
          <AddressField
            address={address}
            onOpen={() => setIsDialogOpen(true)}
            error={serverFieldErrors.complexId}
            disabled={isSubmitting}
          />
        )}

        {showField('capacity') && (
          <TextField
            label="전체 호실 수 (선택)"
            suffix="개"
            numeric
            inputMode="numeric"
            placeholder="30"
            hint="정하면 그 수를 넘게 호실을 등록할 수 없어요. 나중에 바꿀 수 있어요"
            value={form.capacity}
            onChange={(event) => updateField('capacity', event.target.value.replace(/\D/g, '').slice(0, 3))}
            error={fieldError('capacity')}
            disabled={isSubmitting}
          />
        )}

        {showField('memo') && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="building-memo" className="text-label font-semibold text-ink">
              설명 (선택)
            </label>
            <textarea
              id="building-memo"
              rows={4}
              maxLength={MAX_MEMO_LENGTH}
              placeholder="관리 메모를 남겨 두세요"
              value={form.memo}
              onChange={(event) => updateField('memo', event.target.value)}
              disabled={isSubmitting}
              className="rounded-input border border-line px-3.5 py-3 text-card text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            />
            {fieldError('memo') && <p className="text-chip text-crit-ink">{fieldError('memo')}</p>}
          </div>
        )}
      </Card>

      {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}

      <BottomActionBar>
        {!isReady && (!isSequential || step === STEPS.length) && (
          <p className="mb-3 text-sub text-ink-3">건물명과 주소를 입력하면 등록할 수 있어요</p>
        )}
        {isSequential && step < STEPS.length ? (
          <Button size="lg" className="w-full" onClick={() => setStep(step + 1)} disabled={!canGoNext}>
            다음
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
            {isSubmitting ? '등록 중' : '건물 등록 · 호실 등록으로'}
          </Button>
        )}
      </BottomActionBar>

      {isDialogOpen && (
        <AddressSearchDialog onResolved={handleResolved} onClose={closeDialog} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
};
