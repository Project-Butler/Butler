// 내 임대 조건(방 구성·설비) 코드 → 화면 문구. 코드 목록과 순서는 서버 apps/api/src/platform/unitListing.js와 같다.
export const UNIT_TYPE_OPTIONS = [
  { value: 'ONE_ROOM', label: '원룸' },
  { value: 'TWO_ROOM', label: '투룸' },
  { value: 'THREE_ROOM', label: '쓰리룸' },
  { value: 'OFFICETEL', label: '오피스텔' },
  { value: 'STORE', label: '상가' },
  { value: 'OTHER', label: '기타' },
];

export const EQUIPMENT_OPTIONS = [
  { value: 'AIR_CONDITIONER', label: '에어컨' },
  { value: 'REFRIGERATOR', label: '냉장고' },
  { value: 'WASHING_MACHINE', label: '세탁기' },
  { value: 'GAS_STOVE', label: '가스레인지' },
  { value: 'INDUCTION', label: '인덕션' },
  { value: 'MICROWAVE', label: '전자레인지' },
  { value: 'BED', label: '침대' },
  { value: 'DESK', label: '책상' },
  { value: 'WARDROBE', label: '옷장' },
  { value: 'SHOE_CABINET', label: '신발장' },
  { value: 'TV', label: 'TV' },
  { value: 'INTERNET', label: '인터넷' },
  { value: 'BIDET', label: '비데' },
  { value: 'DOOR_LOCK', label: '도어락' },
  { value: 'GAS_BOILER', label: '가스보일러' },
];

export const MAX_EQUIPMENT_ETC_LENGTH = 200;

const UNIT_TYPE_LABEL = Object.fromEntries(UNIT_TYPE_OPTIONS.map(({ value, label }) => [value, label]));
const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT_OPTIONS.map(({ value, label }) => [value, label]));

export const getUnitTypeLabel = (unitType) => UNIT_TYPE_LABEL[unitType] ?? null;

// 설비 코드 배열 + 기타 설비 → '에어컨, 냉장고, 기타: 커튼'. 없으면 null.
export const formatEquipment = (equipment, equipmentEtc) => {
  const labels = (equipment ?? []).map((code) => EQUIPMENT_LABEL[code] ?? code);
  if (equipmentEtc) labels.push(`기타: ${equipmentEtc}`);
  return labels.length > 0 ? labels.join(', ') : null;
};

// 호실 운영 상태(Property.status) → Badge
const PROPERTY_STATUS_BADGE = {
  VACANT: { tone: 'default', label: '공실' },
  CONTRACT_PENDING: { tone: 'warning', label: '계약대기' },
  LEASED: { tone: 'success', label: '임대중' },
};

export const getPropertyStatusBadge = (status) => PROPERTY_STATUS_BADGE[status] ?? PROPERTY_STATUS_BADGE.VACANT;
