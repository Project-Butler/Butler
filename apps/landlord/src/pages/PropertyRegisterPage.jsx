import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, TextField } from '@butler/ui';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useBuildingNames } from '../hooks/useBuildingNames';
import { useGetComplex } from '../hooks/useGetComplex';
import { useGetLandlordBuildingList } from '../hooks/useGetLandlordBuildingList';
import { usePostProperty } from '../hooks/usePostProperty';
import { toFieldErrors } from '../utils/apiError';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';
import { formatFloor, parseFloorInput, validateFloorInput } from '../utils/floor';
import { toAreaInput, validateExclusiveArea } from '../utils/formValidation';
import { formatUnitLabel, isKnownBuildingNo, normalizeBuildingNo, normalizeUnitNo } from '../utils/unitAddress';
import { EQUIPMENT_OPTIONS, MAX_EQUIPMENT_ETC_LENGTH, UNIT_TYPE_OPTIONS } from '../utils/unitListing';

// 서버 검증(apps/api properties controller)과 같은 범위
const MAX_UNIT_PART_LENGTH = 10;
const BUILDING_PICKER_SIZE = 50;

// 서버 400 details.field 중 이 화면에 칸이 있는 것
const FORM_FIELDS = ['buildingNo', 'unitNo', 'floor', 'unitType', 'exclusiveArea', 'equipment', 'equipmentEtc'];

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
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-section font-semibold text-ink">호실을 등록할 건물</h2>
        <Button variant="secondary" size="sm" onClick={() => onNavigate('buildingRegister', {}, { replace: true })}>
          <Plus size={14} className="-ml-0.5 mr-1 inline-block" />새 건물 등록
        </Button>
      </div>
      {error && <NoticeBox className="mx-5 mb-5">{error.message}</NoticeBox>}
      {isLoading && !data && (
        <p role="status" className="py-8 text-center text-body text-ink-3">
          불러오는 중입니다
        </p>
      )}
      {data && items.length === 0 && (
        <p className="border-t border-line px-5 py-10 text-center text-body text-ink-3">먼저 건물을 등록해 주세요</p>
      )}
      {items.length > 0 && (
        <table className="w-full text-body">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left text-chip text-ink-3">
              <th className="px-5 py-2.5 font-medium">건물명</th>
              <th className="px-3 py-2.5 font-medium">도로명주소</th>
              <th className="px-5 py-2.5 text-right font-medium">등록 호실</th>
            </tr>
          </thead>
          <tbody>
            {items.map((building) => (
              <tr
                key={building.id}
                onClick={() => onNavigate('propertyRegister', { complexId: building.complex.id }, { replace: true })}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-5 py-3.5 font-semibold text-ink">{building.name}</td>
                <td className="truncate px-3 py-3.5 text-ink-2">{building.complex.roadAddress}</td>
                <td className="px-5 py-3.5 text-right font-num tabular-nums text-ink-2">{building.propertyCount}개</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

const PropertyForm = ({ complexId, onNavigate, onUnauthorized }) => {
  const hookOptions = { onUnauthorized };
  const complexQuery = useGetComplex(complexId, hookOptions);
  const register = usePostProperty(hookOptions);
  const { getBuildingName } = useBuildingNames(hookOptions);
  const complex = complexQuery.data;

  const [form, setForm] = useState(EMPTY_FORM);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  const clientErrors = validateForm(form);
  const fieldError = (name) => clientErrors[name] ?? serverFieldErrors[name];

  const buildingNo = form.noDong ? '' : normalizeBuildingNo(form.buildingNo);
  const unitNo = normalizeUnitNo(form.unitNo);
  const isReady = Boolean(complex && unitNo) && Object.keys(clientErrors).length === 0;
  const isSubmitting = register.isLoading;
  const detailBuildingNames = complex?.detailBuildingNames ?? [];
  const showUnknownDongWarning = Boolean(buildingNo) && !isKnownBuildingNo(buildingNo, detailBuildingNames);

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
      const notice = toSavedValueNotice(body, data.property);
      onNavigate('setup', notice ? { notice } : {}, { replace: true });
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
  const buildingName = getBuildingName(complexId) ?? complex?.name;

  return (
    <>
      <PageHeader
        title="호실 등록"
        description={buildingName ? `${buildingName} · ${complex?.roadAddress ?? complex?.jibunAddress ?? ''}` : undefined}
        onBack={goBack}
      />

      {complexQuery.error && <NoticeBox>{complexQuery.error.message}</NoticeBox>}

      <div className="grid grid-cols-3 items-start gap-6">
        <div className="col-span-2 space-y-4">
          <Card className="space-y-6 p-6">
            <div className="grid grid-cols-2 gap-4">
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
              <TextField
                label="호"
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
              <dt className="text-sub text-ink-3">건물</dt>
              <dd className="mt-0.5 text-body font-medium text-ink">{buildingName ?? '불러오는 중'}</dd>
              {dongRange && <dd className="text-sub text-ink-3">{dongRange}</dd>}
            </div>
            <div>
              <dt className="text-sub text-ink-3">호실</dt>
              <dd className="mt-0.5 flex items-center gap-2 text-body font-semibold text-ink">
                {unitNo ? formatUnitLabel(buildingNo, unitNo) : '호를 입력해 주세요'}
                {unitNo && <Badge tone="pending">미인증</Badge>}
              </dd>
            </div>
          </dl>
          <NoticeBox tone="seal">등록하면 &apos;미인증&apos;으로 저장돼요. 권리자 인증을 마치면 면적·층을 고칠 수 있어요.</NoticeBox>
          {submitError && !hasMappedFieldError && <NoticeBox>{submitError.message}</NoticeBox>}
          <Button size="lg" className="w-full" onClick={handleSubmit} disabled={!isReady || isSubmitting}>
            {isSubmitting ? '등록 중' : '호실 등록'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => window.history.back()} disabled={isSubmitting}>
            취소
          </Button>
        </Card>
      </div>
    </>
  );
};

// 호실 등록(POST /properties): 한 화면에 한 번에 입력. 저장하면 초기 세팅 화면으로 간다(기록 바꿈).
export const PropertyRegisterPage = ({ params, onNavigate, onUnauthorized }) => (
  <div className="w-full max-w-6xl space-y-6 pb-10">
    {params.complexId ? (
      <PropertyForm
        complexId={params.complexId}
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
