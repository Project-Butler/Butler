import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { BottomActionBar } from '../components/BottomActionBar/BottomActionBar';
import { DraftResumeNotice } from '../components/DraftResumeNotice/DraftResumeNotice';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl/SegmentedControl';
import { useGetComplex } from '../hooks/useGetComplex';
import { useGetLandlordBuildingList } from '../hooks/useGetLandlordBuildingList';
import { usePostProperty } from '../hooks/usePostProperty';
import { toFieldErrors } from '../utils/apiError';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';
import { clearDraft, readDraft, toDraftKey, writeDraft } from '../utils/draftStorage';
import { formatFloor, parseFloorInput, validateFloorInput } from '../utils/floor';
import { toAreaInput, validateExclusiveArea } from '../utils/formValidation';
import { REGISTER_MODE_OPTIONS } from '../utils/registerMode';
import { formatDisplayName, isKnownBuildingNo, normalizeBuildingNo, normalizeUnitNo } from '../utils/unitAddress';
import { EQUIPMENT_OPTIONS, MAX_EQUIPMENT_ETC_LENGTH, UNIT_TYPE_OPTIONS } from '../utils/unitListing';

// 서버 검증(apps/api properties controller)과 같은 범위
const MAX_UNIT_PART_LENGTH = 10;
const BUILDING_PICKER_SIZE = 50;

// 순서대로 모드 단계: 동 → 호 → 층 → 방 구성 → 면적 → 설비
const STEPS = ['buildingNo', 'unitNo', 'floor', 'unitType', 'exclusiveArea', 'equipment'];
const STEP_TITLE = {
  buildingNo: '몇 동인가요?',
  unitNo: '몇 호인가요?',
  floor: '몇 층인가요?',
  unitType: '방 구성을 골라 주세요',
  exclusiveArea: '전용면적을 알려 주세요',
  equipment: '있는 설비를 골라 주세요',
};
// 서버 400 details.field → 그 칸이 있는 단계
const STEP_BY_FIELD = {
  buildingNo: 1,
  unitNo: 2,
  floor: 3,
  unitType: 4,
  exclusiveArea: 5,
  equipment: 6,
  equipmentEtc: 6,
};

const EMPTY_FORM = {
  noDong: false,
  buildingNo: '',
  unitNo: '',
  floor: '',
  unitType: '',
  exclusiveArea: '',
  equipment: [],
  equipmentEtc: '',
};

const validateUnitPart = (value, normalize) => {
  if (!value.trim()) return undefined;
  const length = normalize(value).length;
  return length < 1 || length > MAX_UNIT_PART_LENGTH ? `1~${MAX_UNIT_PART_LENGTH}자로 입력해 주세요.` : undefined;
};

// 입력 중인 값의 형식 오류(빈 칸은 검사하지 않음 — 호 필수는 버튼 활성으로 표시)
const validateForm = (form) => {
  const errors = {
    buildingNo: form.noDong ? undefined : validateUnitPart(form.buildingNo, normalizeBuildingNo),
    unitNo: validateUnitPart(form.unitNo, normalizeUnitNo),
    floor: validateFloorInput(form.floor),
    exclusiveArea: validateExclusiveArea(form.exclusiveArea),
    equipmentEtc:
      form.equipmentEtc.trim().length > MAX_EQUIPMENT_ETC_LENGTH ? `${MAX_EQUIPMENT_ETC_LENGTH}자 이하로 입력해 주세요.` : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
};

// 서버로 보낼 바디. 선택 값은 입력했을 때만 넣는다(방 구성·설비를 보내지 않으면 서버가 같은 호실의 내 이전 값을 이어받음).
const toCreateBody = (complexId, form) => {
  const body = { complexId, buildingNo: form.noDong ? '' : form.buildingNo.trim(), unitNo: form.unitNo.trim() };
  const floor = parseFloorInput(form.floor);
  if (floor !== null) body.floor = floor;
  if (form.exclusiveArea) body.exclusiveArea = Number(form.exclusiveArea);
  if (form.unitType) body.unitType = form.unitType;
  if (form.equipment.length > 0) body.equipment = form.equipment;
  if (form.equipmentEtc.trim()) body.equipmentEtc = form.equipmentEtc.trim();
  return body;
};

// 다른 임대인이 먼저 넣은 면적·층이 있으면 서버는 내 입력 대신 그 값을 쓴다 → 저장 뒤 안내.
const toSavedValueNotice = (body, property) => {
  const differs = [];
  if (body.exclusiveArea != null && property.exclusiveArea !== body.exclusiveArea) {
    differs.push(`면적 ${property.exclusiveArea != null ? `${property.exclusiveArea}㎡` : '없음'}`);
  }
  if (body.floor != null && property.floor !== body.floor) {
    differs.push(`층 ${formatFloor(property.floor) ?? '없음'}`);
  }
  if (differs.length === 0) return null;
  return `${property.displayName}: 이미 등록된 값이 있어 그 값을 보여 줍니다(${differs.join(', ')}). 권리자 인증 뒤 수정할 수 있어요.`;
};

const FieldLabel = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="text-label font-semibold text-ink">
    {children}
  </label>
);

const CheckboxChip = ({ checked, onChange, label, disabled }) => (
  <label
    className={`flex h-10 cursor-pointer items-center gap-2 rounded-input border px-3 text-body transition-colors ${
      checked ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-ink-2 hover:bg-surface-2'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
  >
    <input type="checkbox" className="accent-accent" checked={checked} onChange={onChange} disabled={disabled} />
    {label}
  </label>
);

// complexId 없이 들어오면(사이드바 [부동산 등록]) 어느 건물에 등록할지 먼저 고른다.
const BuildingPicker = ({ onNavigate, onUnauthorized }) => {
  const { data, error, isLoading } = useGetLandlordBuildingList({ size: BUILDING_PICKER_SIZE }, { onUnauthorized });
  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <p className="text-body text-ink-2">호실을 등록할 건물을 골라 주세요.</p>
      {error && <NoticeBox>{error.message}</NoticeBox>}
      {isLoading && !data && (
        <p role="status" className="py-6 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}
      {items.map((building) => (
        <button
          key={building.id}
          type="button"
          onClick={() => onNavigate('propertyRegister', { complexId: building.complex.id }, { replace: true })}
          className="block w-full text-left"
        >
          <Card className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-surface-2">
            <div className="min-w-0">
              <p className="text-card font-semibold text-ink">{building.name}</p>
              <p className="mt-0.5 truncate text-sub text-ink-2">{building.complex.roadAddress}</p>
            </div>
            <span className="shrink-0 font-num text-sub tabular-nums text-ink-3">
              {building.propertyCount}
              {building.capacity != null ? ` / ${building.capacity}` : ''}개 등록
            </span>
          </Card>
        </button>
      ))}
      <Button variant="secondary" className="w-full" onClick={() => onNavigate('buildingRegister', {}, { replace: true })}>
        <Plus size={16} className="-ml-0.5 mr-1.5 inline-block" />
        새 건물 등록
      </Button>
    </div>
  );
};

const PropertyForm = ({ user, complexId, initialMode, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const complexQuery = useGetComplex(complexId, hookOptions);
  const register = usePostProperty(hookOptions);
  const complex = complexQuery.data;
  const draftKey = toDraftKey(user.id, 'propertyRegister', complexId);

  const [pendingDraft, setPendingDraft] = useState(() => readDraft(draftKey));
  const [mode, setMode] = useState(initialMode ?? 'sequential');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const isSequential = mode === 'sequential';
  const currentStep = STEPS[step - 1];
  const clientErrors = validateForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];

  const buildingNo = form.noDong ? '' : normalizeBuildingNo(form.buildingNo);
  const unitNo = normalizeUnitNo(form.unitNo);
  const isReady = Boolean(complex && unitNo) && Object.keys(clientErrors).length === 0;
  const isSubmitting = register.isLoading;
  const detailBuildingNames = complex?.detailBuildingNames ?? [];
  const showUnknownDongWarning = Boolean(buildingNo) && !isKnownBuildingNo(buildingNo, detailBuildingNames);

  useEffect(() => {
    if (!isSequential || pendingDraft) return;
    if (step === 1 && JSON.stringify(form) === JSON.stringify(EMPTY_FORM)) return;
    writeDraft(draftKey, { mode, step, form });
  }, [isSequential, pendingDraft, draftKey, mode, step, form]);

  const resumeDraft = () => {
    setMode(pendingDraft.mode ?? 'sequential');
    setStep(pendingDraft.step ?? 1);
    setForm({ ...EMPTY_FORM, ...pendingDraft.form });
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

  const toggleEquipment = (code) =>
    updateField(
      'equipment',
      form.equipment.includes(code) ? form.equipment.filter((value) => value !== code) : [...form.equipment, code],
    );

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const body = toCreateBody(complexId, form);
    const { data, error } = await register.createProperty(body);
    if (data) {
      clearDraft(draftKey);
      const notice = toSavedValueNotice(body, data.property);
      onNavigate('setup', notice ? { notice } : {}, { replace: true });
      return;
    }
    if (error?.status === 400) {
      const fieldErrors = toFieldErrors(error);
      setServerFieldErrors(fieldErrors);
      const firstStep = Math.min(...Object.keys(fieldErrors).map((field) => STEP_BY_FIELD[field] ?? STEPS.length));
      if (isSequential && Number.isFinite(firstStep)) setStep(firstStep);
    }
  };

  const canGoNext = !clientErrors[currentStep] && (currentStep !== 'unitNo' || Boolean(unitNo));
  const submitError = register.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => field in STEP_BY_FIELD);
  const showField = (name) => !isSequential || currentStep === name;
  const disabled = !complex || isSubmitting;

  const goBack = () => {
    if (isSequential && step > 1) {
      setStep(step - 1);
      return;
    }
    window.history.back();
  };

  const dongRange = formatDetailBuildingRange(detailBuildingNames);

  return (
    <>
      <PageHeader
        title="호실 등록"
        onBack={goBack}
        step={isSequential ? step : undefined}
        totalSteps={isSequential ? STEPS.length : undefined}
      />

      {pendingDraft && (
        <DraftResumeNotice
          description={pendingDraft.form?.unitNo ? `${pendingDraft.form.unitNo}호 작성 중` : undefined}
          onResume={resumeDraft}
          onDiscard={discardDraft}
        />
      )}

      {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}
      <Card className="p-5">
        <p className="text-sub text-ink-3">건물</p>
        <p className="mt-0.5 text-card font-semibold text-ink">{complex?.name ?? '불러오는 중'}</p>
        {complex && (
          <p className="mt-0.5 text-sub text-ink-2">
            {complex.roadAddress ?? complex.jibunAddress}
            {dongRange && <span className="text-ink-3"> · {dongRange}</span>}
          </p>
        )}
      </Card>

      <SegmentedControl label="입력 방식" options={REGISTER_MODE_OPTIONS} value={mode} onChange={setMode} disabled={isSubmitting} />

      <Card className="space-y-5 p-5">
        {isSequential && <h2 className="text-section font-semibold text-ink">{STEP_TITLE[currentStep]}</h2>}

        {(showField('buildingNo') || showField('unitNo')) && (
          <div className={isSequential ? 'space-y-4' : 'grid grid-cols-2 gap-4'}>
            {showField('buildingNo') && (
              <div className="space-y-2">
                <TextField
                  label="동 (선택)"
                  suffix="동"
                  placeholder={detailBuildingNames[0] ? normalizeBuildingNo(detailBuildingNames[0]) : '101'}
                  value={form.noDong ? '' : form.buildingNo}
                  onChange={(event) => updateField('buildingNo', event.target.value)}
                  error={fieldError('buildingNo')}
                  disabled={disabled || form.noDong}
                />
                <CheckboxChip
                  label="동이 없는 건물이에요"
                  checked={form.noDong}
                  onChange={(event) => updateField('noDong', event.target.checked)}
                  disabled={disabled}
                />
                {showUnknownDongWarning && (
                  <NoticeBox tone="warn">
                    이 주소의 동 목록({dongRange})에 없는 동이에요. 맞는지 확인해 주세요. 그대로 등록할 수도 있어요.
                  </NoticeBox>
                )}
              </div>
            )}
            {showField('unitNo') && (
              <TextField
                label="호"
                suffix="호"
                placeholder="1203"
                value={form.unitNo}
                onChange={(event) => updateField('unitNo', event.target.value)}
                error={fieldError('unitNo')}
                disabled={disabled}
              />
            )}
          </div>
        )}

        {(showField('floor') || showField('exclusiveArea')) && (
          <div className={isSequential ? '' : 'grid grid-cols-2 gap-4'}>
            {showField('floor') && (
              <TextField
                label="층 (선택)"
                placeholder="12 또는 B1"
                hint="지하는 B1, 지하1처럼 적어요"
                value={form.floor}
                onChange={(event) => updateField('floor', event.target.value)}
                error={fieldError('floor')}
                disabled={disabled}
              />
            )}
            {showField('exclusiveArea') && (
              <TextField
                label="전용면적 (선택)"
                suffix="㎡"
                numeric
                placeholder="39.78"
                value={form.exclusiveArea}
                onChange={(event) => updateField('exclusiveArea', toAreaInput(event.target.value))}
                error={fieldError('exclusiveArea')}
                disabled={disabled}
              />
            )}
          </div>
        )}

        {showField('unitType') && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="unit-type">방 구성 (선택)</FieldLabel>
            <select
              id="unit-type"
              value={form.unitType}
              onChange={(event) => updateField('unitType', event.target.value)}
              disabled={disabled}
              className="h-12 rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
            >
              <option value="">선택 안 함</option>
              {UNIT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldError('unitType') && <p className="text-chip text-crit-ink">{fieldError('unitType')}</p>}
          </div>
        )}

        {showField('equipment') && (
          <div className="space-y-3">
            <p className="text-label font-semibold text-ink">설비 (선택)</p>
            <div className="grid grid-cols-4 gap-2">
              {EQUIPMENT_OPTIONS.map((option) => (
                <CheckboxChip
                  key={option.value}
                  label={option.label}
                  checked={form.equipment.includes(option.value)}
                  onChange={() => toggleEquipment(option.value)}
                  disabled={disabled}
                />
              ))}
            </div>
            {fieldError('equipment') && <p className="text-chip text-crit-ink">{fieldError('equipment')}</p>}
            <TextField
              label="기타 설비 (선택)"
              placeholder="예: 커튼, 블라인드"
              maxLength={MAX_EQUIPMENT_ETC_LENGTH}
              value={form.equipmentEtc}
              onChange={(event) => updateField('equipmentEtc', event.target.value)}
              error={fieldError('equipmentEtc')}
              disabled={disabled}
            />
          </div>
        )}
      </Card>

      <NoticeBox tone="seal">
        등록하면 &apos;미인증&apos; 상태로 저장됩니다 · 권리자 인증을 마치면 면적·층을 고치고 커뮤니티·분쟁 상담을 쓸 수 있어요
      </NoticeBox>

      {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}

      <BottomActionBar>
        {complex && unitNo && (!isSequential || step === STEPS.length) && (
          <div className="mb-3 flex items-center gap-2">
            <p className="text-body font-semibold text-ink">{formatDisplayName(complex.name, buildingNo, unitNo)}로 등록합니다</p>
            <Badge tone="pending">미인증</Badge>
          </div>
        )}
        {isSequential && step < STEPS.length ? (
          <Button size="lg" className="w-full" onClick={() => setStep(step + 1)} disabled={!canGoNext || !complex}>
            다음
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
            {isSubmitting ? '등록 중' : '호실 등록'}
          </Button>
        )}
      </BottomActionBar>
    </>
  );
};

// 호실 등록(POST /properties): 순서대로 / 한 번에. 저장하면 초기 세팅 화면으로 간다(기록 바꿈).
export const PropertyRegisterPage = ({ user, params, onNavigate, onUnauthorized }) => (
  <div className="mx-auto max-w-2xl space-y-5 pb-48">
    {params.complexId ? (
      <PropertyForm
        user={user}
        complexId={params.complexId}
        initialMode={params.mode}
        onNavigate={onNavigate}
        onUnauthorized={onUnauthorized}
      />
    ) : (
      <>
        <PageHeader title="호실 등록" onBack={() => window.history.back()} />
        <BuildingPicker onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
      </>
    )}
  </div>
);
