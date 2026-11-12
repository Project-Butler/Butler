import { useLocation, useNavigate } from 'react-router-dom';
import { Button, MobileFormLayout, RequiredMark, TextField } from '@butler/ui';
import { AddressSearchDialog } from '../../web/components/AddressSearchDialog/AddressSearchDialog';
import { NoticeBox } from '../../web/components/NoticeBox/NoticeBox';
import { DONG_CUSTOM, DONG_NONE, usePropertyRegisterForm } from '../../web/hooks/usePropertyRegisterForm';
import { HOME_PATH } from '../../web/routes';
import { toAreaInput } from '../../web/utils/formValidation';
import { normalizeBuildingNo } from '../../web/utils/unitAddress';
import { EQUIPMENT_OPTIONS, MAX_EQUIPMENT_ETC_LENGTH, UNIT_TYPE_OPTIONS } from '../../web/utils/unitListing';
import searchIcon from '../assets/icon-search.svg';

const REGISTERED_NOTICE = '부동산을 등록했어요';
const SELECT_CLASS =
  'h-12 w-full rounded-input border border-line bg-surface px-3.5 text-body text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-3';

const FieldLabel = ({ children, htmlFor, required = false }) => (
  <label htmlFor={htmlFor} className="text-m-label font-semibold text-ink">
    {children}
    {required && <RequiredMark />}
  </label>
);

const FieldError = ({ children }) => (children ? <p className="text-m-sub text-crit-ink">{children}</p> : null);

const CheckboxChip = ({ checked, onChange, label, disabled }) => (
  <label
    className={`flex h-10 cursor-pointer items-center gap-2 rounded-input border px-3 text-body transition-colors ${
      checked ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink-2'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
  >
    <input type="checkbox" className="accent-accent" checked={checked} onChange={onChange} disabled={disabled} />
    {label}
  </label>
);

// 임대인 앱 부동산 등록 (Figma M04 / 부동산 등록, 3:202). 웹 부동산 등록과 같은 입력 항목·검증·API(usePropertyRegisterForm)이고 모양만 Figma 를 따른다.
// Figma 의 "유형(아파트·빌라·오피스텔)"은 저장할 곳이 없어 두지 않는다. 등록 완료 화면(M17)은 만들지 않고,
// 저장하면 앱 홈으로 가서(기록 바꿈) "부동산을 등록했어요"를 한 번 보여 준다(history state). 하단 탭이 없는 입력 화면이다.
export const PropertyRegisterPage = ({ onUnauthorized }) => {
  const navigate = useNavigate();
  const location = useLocation();
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
    detailBuildingNames,
    hasDongList,
    dongRange,
    showUnknownDongWarning,
    isReady,
    isSubmitting,
    disabled,
    submitErrorMessage,
    submit,
  } = usePropertyRegisterForm({ onUnauthorized });

  // 이전 화면이 있으면 그리로, 주소로 바로 들어와 기록이 없으면(location.key 가 'default') 홈으로 보낸다. 안 그러면 앱 밖으로 나가거나 아무 일도 없다.
  const goBack = () => (location.key === 'default' ? navigate(HOME_PATH, { replace: true }) : navigate(-1));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await submit();
    if (!result) return;
    const notice = result.notice ? `${REGISTERED_NOTICE}. ${result.notice}` : REGISTERED_NOTICE;
    navigate(HOME_PATH, { replace: true, state: { notice } });
  };

  return (
    <MobileFormLayout
      shell="landlord-app-form"
      topBar={{ title: '부동산 등록', onBack: goBack }}
      onSubmit={handleSubmit}
      overlay={isDialogOpen && <AddressSearchDialog onResolved={handleResolved} onClose={closeDialog} onUnauthorized={onUnauthorized} />}
      cta={
        <Button type="submit" size="h52" className="flex-1" disabled={!isReady || isSubmitting}>
          {isSubmitting ? '등록 중' : '등록'}
        </Button>
      }
    >
      <h2 className="text-page-sm font-bold text-ink">기본 정보</h2>

      <div className="flex flex-col gap-1.5">
        <p className="text-m-label font-semibold text-ink">
          주소
          <RequiredMark />
        </p>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={openDialog}
            disabled={isSubmitting}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-input border border-line bg-surface px-3.5 py-2 text-left text-body"
          >
            <span className={`min-w-0 flex-1 text-body ${complex ? 'text-ink' : 'text-ink-3'}`}>
              {complex ? complex.roadAddress ?? complex.jibunAddress : '도로명·지번 주소'}
            </span>
            <img src={searchIcon} alt="" width={18} height={18} />
          </button>
          <Button variant="secondary" size="h48" className="shrink-0" onClick={openDialog} disabled={isSubmitting}>
            검색
          </Button>
        </div>
        {complex?.roadAddress && complex.jibunAddress && <p className="text-m-sub text-ink-2">지번 {complex.jibunAddress}</p>}
        <FieldError>{serverFieldErrors.complexId}</FieldError>
      </div>

      <TextField mobile label="단지명" value={complex?.name ?? ''} placeholder="주소를 검색하면 채워져요" disabled readOnly />

      <div className="grid grid-cols-2 items-start gap-2.5">
        <div className="flex min-w-0 flex-col gap-2">
          {hasDongList ? (
            <>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="app-dong-choice" required>
                  동
                </FieldLabel>
                <select
                  id="app-dong-choice"
                  aria-required="true"
                  value={form.dongChoice}
                  onChange={(event) => chooseDong(event.target.value)}
                  disabled={disabled}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    동 선택
                  </option>
                  {detailBuildingNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option disabled>──────</option>
                  <option value={DONG_NONE}>동이 없음</option>
                  <option value={DONG_CUSTOM}>직접 입력</option>
                </select>
                {form.dongChoice !== DONG_CUSTOM && <FieldError>{fieldError('buildingNo')}</FieldError>}
              </div>
              {form.dongChoice === DONG_CUSTOM && (
                <TextField
                  mobile
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
                mobile
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
        </div>
        <TextField
          mobile
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
      {showUnknownDongWarning && (
        <NoticeBox tone="warn">이 주소의 동 목록({dongRange})에 없는 동이에요. 맞는지 확인해 주세요. 그대로 등록할 수도 있어요.</NoticeBox>
      )}

      <div className="grid grid-cols-2 items-start gap-2.5">
        <TextField
          mobile
          label="층 (선택)"
          placeholder="12 또는 B1"
          hint="지하는 B1처럼 적어요"
          value={form.floor}
          onChange={(event) => updateField('floor', event.target.value)}
          error={fieldError('floor')}
          disabled={disabled}
        />
        <TextField
          mobile
          label="전용면적 (선택)"
          suffix="㎡"
          numeric
          placeholder="84.97"
          value={form.exclusiveArea}
          onChange={(event) => updateField('exclusiveArea', toAreaInput(event.target.value))}
          error={fieldError('exclusiveArea')}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="app-unit-type">방 구성 (선택)</FieldLabel>
        <select
          id="app-unit-type"
          value={form.unitType}
          onChange={(event) => updateField('unitType', event.target.value)}
          disabled={disabled}
          className={SELECT_CLASS}
        >
          <option value="">선택 안 함</option>
          {UNIT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError>{fieldError('unitType')}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-m-label font-semibold text-ink">설비 (선택)</p>
        <div className="grid grid-cols-3 gap-2">
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
        <FieldError>{fieldError('equipment')}</FieldError>
        <TextField
          mobile
          label="기타 설비 (선택)"
          placeholder="예: 커튼, 블라인드"
          maxLength={MAX_EQUIPMENT_ETC_LENGTH}
          value={form.equipmentEtc}
          onChange={(event) => updateField('equipmentEtc', event.target.value)}
          error={fieldError('equipmentEtc')}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-1 rounded-btn bg-seal-soft px-3.5 py-3 text-seal-ink">
        <p className="text-m-label font-semibold">권리자 인증 안내</p>
        <p className="text-m-sub">등록 직후 상태는 미인증입니다. 권리자 인증을 마치면 커뮤니티와 분쟁 상담이 열립니다.</p>
      </div>

      {submitErrorMessage && <NoticeBox>{submitErrorMessage}</NoticeBox>}

    </MobileFormLayout>
  );
};
