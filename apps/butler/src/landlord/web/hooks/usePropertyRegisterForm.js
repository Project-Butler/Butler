import { useCallback, useState } from 'react';
import { toFieldErrors } from '../../../shared/apiError';
import { formatDetailBuildingRange } from '../utils/detailBuildingNames';
import { formatFloor, parseFloorInput, validateFloorInput } from '../utils/floor';
import { validateExclusiveArea } from '../utils/formValidation';
import { isKnownBuildingNo, normalizeBuildingNo, normalizeUnitNo } from '../utils/unitAddress';
import { MAX_EQUIPMENT_ETC_LENGTH } from '../utils/unitListing';
import { usePostProperty } from './usePostProperty';

// 서버 검증(apps/api properties controller)과 같은 범위
const MAX_UNIT_PART_LENGTH = 10;

// 서버 400 details.field 중 이 화면에 칸이 있는 것
const FORM_FIELDS = ['complexId', 'buildingNo', 'unitNo', 'floor', 'unitType', 'exclusiveArea', 'equipment', 'equipmentEtc'];

// 동 목록(juso 상세건물명)이 있을 때 동 드롭다운의 목록 밖 선택지
export const DONG_NONE = '__none__';
export const DONG_CUSTOM = '__custom__';

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

// 부동산 등록(POST /properties) 입력 상태·검증·저장. 웹(PropertyRegisterPage)과 앱(M04)이 같이 쓰고, 모양과 저장 뒤 이동만 화면이 정한다.
// 한 번에 한 호실씩 등록한다. submit()은 성공하면 { property, notice }(notice: 이미 등록된 면적·층을 썼을 때의 안내 또는 null), 아니면 null.
export const usePropertyRegisterForm = ({ onUnauthorized }) => {
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

  const openDialog = useCallback(() => setIsDialogOpen(true), []);
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

  const submit = async () => {
    if (!isReady || isSubmitting) return null;
    const body = toCreateBody(complex.id, form);
    const { data, error } = await register.createProperty(body);
    if (data) return { property: data.property, notice: toSavedValueNotice(body, data.property) };
    if (error?.status === 400) setServerFieldErrors(toFieldErrors(error));
    return null;
  };

  const submitError = register.error;
  const hasMappedFieldError =
    submitError?.status === 400 && submitError.details.some(({ field }) => FORM_FIELDS.includes(field));

  return {
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
    dongRange: formatDetailBuildingRange(detailBuildingNames),
    showUnknownDongWarning,
    isReady,
    isSubmitting,
    // 주소를 고르기 전이거나 저장 중이면 칸을 잠근다.
    disabled: !complex || isSubmitting,
    // 칸에 붙지 않는 저장 오류(화면 위쪽·요약에 보여 줄 것). 칸 오류로 보여 준 400 은 null.
    submitErrorMessage: submitError && !hasMappedFieldError ? submitError.message : null,
    submit,
  };
};
