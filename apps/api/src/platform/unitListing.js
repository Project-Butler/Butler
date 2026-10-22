// 내 소유 관계의 임대 조건(방 구성·설비) 값 목록과 검증(DB 의존 없음).
// Postgres enum 대신 문자열 + 이 상수로 검사한다 — 항목을 더할 때 마이그레이션이 필요 없다.

export const UNIT_TYPES = Object.freeze(['ONE_ROOM', 'TWO_ROOM', 'THREE_ROOM', 'OFFICETEL', 'STORE', 'OTHER']);

export const EQUIPMENT_CODES = Object.freeze([
  'AIR_CONDITIONER',
  'REFRIGERATOR',
  'WASHING_MACHINE',
  'GAS_STOVE',
  'INDUCTION',
  'MICROWAVE',
  'BED',
  'DESK',
  'WARDROBE',
  'SHOE_CABINET',
  'TV',
  'INTERNET',
  'BIDET',
  'DOOR_LOCK',
  'GAS_BOILER',
]);

export const MAX_EQUIPMENT_ETC_LENGTH = 200; // PropertyOwnership.equipmentEtc VarChar(200)

export const LISTING_FIELDS = Object.freeze(['unitType', 'equipment', 'equipmentEtc']);

// 아래 parse*는 null(값 비우기)을 받으면 저장할 빈 값을 돌려준다. 틀린 값은 details에 쌓고 undefined.
export const parseUnitType = (value, details) => {
  if (value === null) return null;
  if (!UNIT_TYPES.includes(value)) {
    details.push({ field: 'unitType', reason: `${UNIT_TYPES.join(', ')} 중 하나여야 합니다.` });
    return undefined;
  }
  return value;
};

// 중복은 없애고 상수 순서로 정렬해 저장한다(같은 설비 조합은 같은 값).
export const parseEquipment = (value, details) => {
  if (value === null) return [];
  if (!Array.isArray(value) || !value.every((code) => EQUIPMENT_CODES.includes(code))) {
    details.push({ field: 'equipment', reason: `${EQUIPMENT_CODES.join(', ')} 값의 배열이어야 합니다.` });
    return undefined;
  }
  return EQUIPMENT_CODES.filter((code) => value.includes(code));
};

// 앞뒤 공백은 떼고, 비면 null.
export const parseEquipmentEtc = (value, details) => {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length > MAX_EQUIPMENT_ETC_LENGTH) {
    details.push({ field: 'equipmentEtc', reason: `${MAX_EQUIPMENT_ETC_LENGTH}자 이하 문자열이어야 합니다.` });
    return undefined;
  }
  return value.trim() || null;
};

// body에 온 칸만 검사해 { unitType?, equipment?, equipmentEtc? }로 돌려준다(오지 않은 칸은 키 없음).
export const parseListingFields = (body, details) => {
  const listing = {};
  if (body.unitType !== undefined) listing.unitType = parseUnitType(body.unitType, details);
  if (body.equipment !== undefined) listing.equipment = parseEquipment(body.equipment, details);
  if (body.equipmentEtc !== undefined) listing.equipmentEtc = parseEquipmentEtc(body.equipmentEtc, details);
  return listing;
};

// 응답의 myListing / 소유 관계 응답의 세 칸.
export const toListing = (ownership) => ({
  unitType: ownership.unitType ?? null,
  equipment: ownership.equipment ?? [],
  equipmentEtc: ownership.equipmentEtc ?? null,
});
