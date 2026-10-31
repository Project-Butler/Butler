import { useCallback, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Badge, Button, Card, RequiredMark, TextField } from '@butler/ui';
import { AddressSearchDialog } from '../components/AddressSearchDialog/AddressSearchDialog';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { usePostProperty } from '../hooks/usePostProperty';
import { toFieldErrors } from '../utils/apiError';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';
import { formatFloor, parseFloorInput, validateFloorInput } from '../utils/floor';
import { toAreaInput, validateExclusiveArea } from '../utils/formValidation';
import { formatUnitLabel, isKnownBuildingNo, normalizeBuildingNo, normalizeUnitNo } from '../utils/unitAddress';
import { EQUIPMENT_OPTIONS, MAX_EQUIPMENT_ETC_LENGTH, UNIT_TYPE_OPTIONS } from '../utils/unitListing';

// 서버 검증(apps/api properties controller)과 같은 범위
const MAX_UNIT_PART_LENGTH = 10;

// 서버 400 details.field 중 이 화면에 칸이 있는 것
const FORM_FIELDS = ['complexId', 'buildingNo', 'unitNo', 'floor', 'unitType', 'exclusiveArea', 'equipment', 'equipmentEtc'];

// 동 목록(juso 상세건물명)이 있을 때 동 드롭다운의 목록 밖 선택지
const DONG_NONE = '__none__';
const DONG_CUSTOM = '__custom__';

const EMPTY_FORM = {
  dongChoice: '',
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

const FieldLabel = ({ children, htmlFor, required = false }) => (
  <label htmlFor={htmlFor} className="text-label font-semibold text-ink">
    {children}
    {required && <RequiredMark />}
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

const AddressField = ({ complex, onOpen, error, disabled }) => (
  <div className="flex flex-col gap-1.5">
    <p className="text-label font-semibold text-ink">
      주소
      <RequiredMark />
    </p>
    {complex ? (
      <div className="flex items-start justify-between gap-4 rounded-input border border-line px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-card font-medium text-ink">{complex.roadAddress ?? complex.jibunAddress}</p>
          {complex.roadAddress && complex.jibunAddress && <p className="text-sub text-ink-2">지번 {complex.jibunAddress}</p>}
          {complex.zipCode && <p className="font-num text-sub tabular-nums text-ink-3">우편번호 {complex.zipCode}</p>}
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

// 부동산 등록(POST /properties): 주소와 동·호를 한 화면에서 입력한다. 저장하면 내 부동산 목록으로 간다(기록 바꿈).
export const PropertyRegisterPage = ({ onNavigate, onUnauthorized }) => {
  const register = usePostProperty({ onUnauthorized });
  const [complex, setComplex] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const clientErrors = validateForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];

  const buildingNo = form.noDong ? '' : normalizeBuildingNo(form.buildingNo);
  const unitNo = normalizeUnitNo(form.unitNo);
  const detailBuildingNames = complex?.detailBuildingNames ?? [];
  const hasDongList = detailBuildingNames.length > 0;
  // 동 목록이 있으면 동을 고르거나 '동이 없음'·'직접 입력'(값 입력)까지 해야 등록할 수 있다.
  const isDongChosen = !hasDongList || (form.dongChoice !== '' && (form.dongChoice !== DONG_CUSTOM || Boolean(buildingNo)));
  const isReady = Boolean(complex && unitNo) && isDongChosen && Object.keys(clientErrors).length === 0;
  const isSubmitting = register.isLoading;
  const showUnknownDongWarning = Boolean(buildingNo) && !isKnownBuildingNo(buildingNo, detailBuildingNames);

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  // 목록의 동을 고르면 그 이름을 그대로 동으로 쓴다('101동' → 서버가 '101'로 정규화).
  const chooseDong = (choice) => {
    const isListName = choice !== DONG_NONE && choice !== DONG_CUSTOM;
    setForm((prev) => ({ ...prev, dongChoice: choice, noDong: choice === DONG_NONE, buildingNo: isListName ? choice : '' }));
    setServerFieldErrors((prev) => ({ ...prev, buildingNo: undefined }));
  };

  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  // 주소가 바뀌면 동 목록도 달라지므로 동 선택을 비운다.
  const handleResolved = (resolved) => {
    setComplex(resolved);
    setForm((prev) => ({ ...prev, dongChoice: '', noDong: false, buildingNo: '' }));
    setServerFieldErrors((prev) => ({ ...prev, complexId: undefined, buildingNo: undefined }));
    register.reset();
    setIsDialogOpen(false);
  };

  const toggleEquipment = (code) =>
    updateField(
      'equipment',
      form.equipment.includes(code) ? form.equipment.filter((value) => value !== code) : [...form.equipment, code],
    );

  const handleSubmit = async () => {
    if (!isReady || isSubmitting) return;
    const body = toCreateBody(complex.id, form);
    const { data, error } = await register.createProperty(body);
    if (data) {
      const notice = toSavedValueNotice(body, data.property);
      onNavigate('buildingList', notice ? { notice } : {}, { replace: true });
      return;
    }
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
  };

  const submitError = register.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => FORM_FIELDS.includes(field));
  const disabled = !complex || isSubmitting;

  const goBack = () => window.history.back();

  const dongRange = formatDetailBuildingRange(detailBuildingNames);

  return (
    <div className="w-full max-w-6xl space-y-6 pb-10">
      <PageHeader title="부동산 등록" description="주소와 동·호를 입력하면 등록돼요." onBack={goBack} />

      <div className="grid grid-cols-3 items-start gap-6">
        <div className="col-span-2 space-y-4">
          <Card className="space-y-6 p-6">
            <AddressField
              complex={complex}
              onOpen={() => setIsDialogOpen(true)}
              error={serverFieldErrors.complexId}
              disabled={isSubmitting}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {hasDongList ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <FieldLabel htmlFor="dong-choice" required>
                        동
                      </FieldLabel>
                      <select
                        id="dong-choice"
                        aria-required="true"
                        value={form.dongChoice}
                        onChange={(event) => chooseDong(event.target.value)}
                        disabled={disabled}
                        className="h-12 rounded-input border border-line bg-surface px-3 text-card text-ink outline-none focus:border-accent disabled:bg-surface-2"
                      >
                        <option value="" disabled>
                          동을 선택해 주세요
                        </option>
                        {detailBuildingNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option disabled>──────────</option>
                        <option value={DONG_NONE}>동이 없음</option>
                        <option value={DONG_CUSTOM}>직접 입력</option>
                      </select>
                      {form.dongChoice !== DONG_CUSTOM && fieldError('buildingNo') && (
                        <p className="text-chip text-crit-ink">{fieldError('buildingNo')}</p>
                      )}
                    </div>
                    {form.dongChoice === DONG_CUSTOM && (
                      <TextField
                        aria-label="동 직접 입력"
                        suffix="동"
                        placeholder={normalizeBuildingNo(detailBuildingNames[0])}
                        value={form.buildingNo}
                        onChange={(event) => updateField('buildingNo', event.target.value)}
                        error={fieldError('buildingNo')}
                        disabled={disabled}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <TextField
                      label="동 (선택)"
                      suffix="동"
                      placeholder="101"
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
                  </>
                )}
                {showUnknownDongWarning && (
                  <NoticeBox tone="warn">
                    이 주소의 동 목록({dongRange})에 없는 동이에요. 맞는지 확인해 주세요. 그대로 등록할 수도 있어요.
                  </NoticeBox>
                )}
              </div>
              <TextField
                label="호"
                required
                suffix="호"
                placeholder="1203"
                value={form.unitNo}
                onChange={(event) => updateField('unitNo', event.target.value)}
                error={fieldError('unitNo')}
                disabled={disabled}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="층 (선택)"
                placeholder="12 또는 B1"
                hint="지하는 B1, 지하1처럼 적어요"
                value={form.floor}
                onChange={(event) => updateField('floor', event.target.value)}
                error={fieldError('floor')}
                disabled={disabled}
              />
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
            </div>

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
          </Card>
        </div>

        <Card className="sticky top-6 space-y-4 p-6">
          <h2 className="text-section font-semibold text-ink">등록 요약</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sub text-ink-3">단지</dt>
              <dd className="mt-0.5 text-body font-medium text-ink">{complex?.name ?? '주소를 검색해 주세요'}</dd>
              {dongRange && <dd className="text-sub text-ink-3">{dongRange}</dd>}
            </div>
            <div>
              <dt className="text-sub text-ink-3">호실</dt>
              <dd className="mt-0.5 flex items-center gap-2 text-body font-semibold text-ink">
                {!isDongChosen ? '동을 선택해 주세요' : unitNo ? formatUnitLabel(buildingNo, unitNo) : '호를 입력해 주세요'}
                {unitNo && <Badge tone="pending">미인증</Badge>}
              </dd>
            </div>
          </dl>
          <NoticeBox tone="seal">등록하면 &apos;미인증&apos;으로 저장돼요. 권리자 인증을 마치면 면적·층을 고칠 수 있어요.</NoticeBox>
          {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}
          <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
            {isSubmitting ? '등록 중' : '등록'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => window.history.back()} disabled={isSubmitting}>
            취소
          </Button>
        </Card>
      </div>

      {isDialogOpen && (
        <AddressSearchDialog onResolved={handleResolved} onClose={closeDialog} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
};
