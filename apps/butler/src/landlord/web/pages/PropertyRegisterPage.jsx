import { BedDouble, Building2, MapPin, Search } from 'lucide-react';
import { Badge, Button, RequiredMark, TextField } from '@butler/ui';
import { AddressSearchDialog } from '../components/AddressSearchDialog/AddressSearchDialog';
import { NoticeBox } from '../components/NoticeBox/NoticeBox';
import { FormPageLayout } from '../components/FormPageLayout/FormPageLayout';
import { FormSection } from '../components/FormSection/FormSection';
import { FormSummary } from '../components/FormSummary/FormSummary';
import { DONG_CUSTOM, DONG_NONE, usePropertyRegisterForm } from '../hooks/usePropertyRegisterForm';
import { toAreaInput } from '../utils/formValidation';
import { formatUnitLabel, normalizeBuildingNo } from '../utils/unitAddress';
import { EQUIPMENT_OPTIONS, MAX_EQUIPMENT_ETC_LENGTH, UNIT_TYPE_OPTIONS } from '../utils/unitListing';

const FieldLabel = ({ children, htmlFor, required = false }) => (
  <label htmlFor={htmlFor} className="text-label font-semibold text-ink">
    {children}
    {required && <RequiredMark />}
  </label>
);

// 설비 체크(칩형, 높이 40). 한 줄 5개로 15개가 3줄에 들어간다.
const CheckboxChip = ({ checked, onChange, label, disabled }) => (
  <label
    className={`flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-input border px-3 text-body transition-colors ${
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
        <Search size={18} className="shrink-0" />
        도로명, 건물명, 지번으로 주소를 검색해 주세요
      </button>
    )}
    {error && <p className="text-chip text-crit-ink">{error}</p>}
  </div>
);

// 라벨 줄 오른쪽에 붙는 작은 체크(동 없는 건물). 별도 줄을 쓰지 않는다.
const InlineCheckbox = ({ checked, onChange, label, disabled }) => (
  <label className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sub text-ink-2 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
    <input type="checkbox" className="accent-accent" checked={checked} onChange={onChange} disabled={disabled} />
    {label}
  </label>
);

// 부동산 등록(POST /properties): 구역 폼(주소 / 동 · 호 / 방 구성 · 설비) + 오른쪽 요약. 저장하면 그 호실 상세 위 권리자 인증 팝업으로 간다(기록 바꿈).
// 한 번에 한 호실씩 등록한다. 여러 호실은 인증 화면의 [나중에 하기]·[다른 호실 등록]을 거쳐 이어서 등록한다.
export const PropertyRegisterPage = ({ onNavigate, onUnauthorized }) => {
  const {
    complex,
    form,
    fieldError,
    serverFieldErrors,
    updateField,
    chooseDong,
    toggleEquipment,
    isDialogOpen,
    openDialog,
    closeDialog,
    handleResolved,
    buildingNo,
    unitNo,
    detailBuildingNames,
    hasDongList,
    isDongChosen,
    dongRange,
    showUnknownDongWarning,
    isReady,
    isSubmitting,
    disabled,
    submitErrorMessage,
    submit,
  } = usePropertyRegisterForm({ onUnauthorized });

  const handleSubmit = async () => {
    const result = await submit();
    if (result) onNavigate('propertyVerify', { propertyId: result.property.id, ...(result.notice && { notice: result.notice }) }, { replace: true });
  };


  const unitLabel = !isDongChosen ? '동을 선택해 주세요' : unitNo ? formatUnitLabel(buildingNo, unitNo) : '호를 입력해 주세요';
  const roomSummary = [form.unitType && UNIT_TYPE_OPTIONS.find((option) => option.value === form.unitType)?.label, form.equipment.length > 0 && `설비 ${form.equipment.length}개`]
    .filter(Boolean)
    .join(' · ');
  const summaryRows = [
    { label: '주소', value: complex ? (complex.name ?? complex.roadAddress ?? complex.jibunAddress) : '주소를 검색해 주세요', done: Boolean(complex) },
    { label: '동 · 호', value: unitLabel, done: Boolean(isDongChosen && unitNo) },
    { label: '방 구성 · 설비', value: roomSummary || '선택 안 함', done: Boolean(roomSummary) },
  ];

  const actions = (place) => (
    <>
      <Button type="button" variant="secondary" size={place === 'header' ? 'h44' : 'h48'} onClick={() => window.history.back()} disabled={isSubmitting}>
        취소
      </Button>
      <Button type={place === 'footer' ? 'submit' : 'button'} size={place === 'header' ? 'h44' : 'h48'} onClick={place === 'header' ? handleSubmit : undefined} disabled={!isReady || isSubmitting}>
        {isSubmitting ? '등록 중' : '등록'}
      </Button>
    </>
  );

  return (
    <>
      <FormPageLayout
        className="property-create-page"
        title="부동산 등록"
        description="주소와 동·호를 입력하면 등록돼요. 같은 단지의 다른 호실도 따로 등록해요."
        actions={actions}
        onSubmit={handleSubmit}
        summary={
          <FormSummary icon={Building2} title="등록 요약" rows={summaryRows}>
            {dongRange && <p className="text-sub text-ink-3">{dongRange}</p>}
            {unitNo && <Badge tone="pending">미인증</Badge>}
            <NoticeBox tone="seal">등록하면 &apos;미인증&apos;으로 저장돼요. 권리자 인증을 마치면 면적·층을 고칠 수 있어요.</NoticeBox>
            {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}
          </FormSummary>
        }
      >
        <FormSection icon={MapPin} title="주소" description="도로명·건물명·지번으로 찾아요">
          <AddressField
            complex={complex}
            onOpen={openDialog}
            error={serverFieldErrors.complexId}
            disabled={isSubmitting}
          />
        </FormSection>
        <FormSection icon={Building2} title="동 · 호" description="호는 꼭 입력해요">
          {/* 동 · 호 · 층 · 전용면적 한 줄 4칸 */}
          <div className="grid grid-cols-4 items-start gap-4">
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
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="building-no">동 (선택)</FieldLabel>
                    <InlineCheckbox
                      label="동 없는 건물"
                      checked={form.noDong}
                      onChange={(event) => updateField('noDong', event.target.checked)}
                      disabled={disabled}
                    />
                  </div>
                  <TextField
                    id="building-no"
                    suffix="동"
                    placeholder="101"
                    value={form.noDong ? '' : form.buildingNo}
                    onChange={(event) => updateField('buildingNo', event.target.value)}
                    error={fieldError('buildingNo')}
                    disabled={disabled || form.noDong}
                  />
                </div>
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
            <TextField
              label="층 (선택)"
              placeholder="12, 지하는 B1"
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
          {showUnknownDongWarning && (
            <NoticeBox tone="warn">
              이 주소의 동 목록({dongRange})에 없는 동이에요. 맞는지 확인해 주세요. 그대로 등록할 수도 있어요.
            </NoticeBox>
          )}
        </FormSection>
        <FormSection icon={BedDouble} title="방 구성 · 설비" description="선택 항목이에요">
          {/* 방 구성 · 기타 설비 한 줄 2칸 */}
          <div className="grid grid-cols-2 items-start gap-4">
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

          <div className="space-y-2">
            <p className="text-label font-semibold text-ink">설비 (선택)</p>
            <div className="grid grid-cols-5 gap-2">
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
          </div>
        </FormSection>
      </FormPageLayout>

      {isDialogOpen && <AddressSearchDialog onResolved={handleResolved} onClose={closeDialog} onUnauthorized={onUnauthorized} />}
    </>
  );
};
