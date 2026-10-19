// 동·호 표기 정규화 공용 함수(DB 의존 없음).
// Property의 @@unique(complexId, buildingNo, unitNo)가 "같은 집"을 묶는 키라서,
// '101동'·'101'·'１０１'처럼 표기만 다른 값이 서로 다른 호실로 저장되지 않도록
// 저장·비교 전에 반드시 이 함수를 거친다.
//
// 지하 호실 표기('B101'·'지하101' 등) 통일 규칙은 후속 작업이다.

// 숫자·라틴 문자 뒤에 붙은 끝 글자 하나만 뗀다 — '가동'처럼 한글 동 이름은 그대로 둔다.
const stripTrailingSuffix = (value, suffix) => {
  const pattern = new RegExp(`([0-9A-Z])${suffix}$`);
  return value.replace(pattern, '$1');
};

const normalizeUnitPart = (value, suffix) => {
  if (typeof value !== 'string') return '';
  const normalized = value
    .normalize('NFKC') // 전각 숫자·라틴 → 반각
    .replace(/\s+/g, '')
    .toUpperCase(); // 한글에는 영향이 없고 라틴만 대문자가 된다
  const stripped = stripTrailingSuffix(normalized, suffix);
  // '동'·'호'만 입력한 경우는 값이 없는 것으로 본다(호출 쪽 길이 검사에서 거부됨).
  return stripped === suffix ? '' : stripped;
};

export const normalizeBuildingNo = (value) => normalizeUnitPart(value, '동');

export const normalizeUnitNo = (value) => normalizeUnitPart(value, '호');

// 화면 표시용 이름. 예: formatDisplayName('잠실OO아파트', '101', '1203') → '잠실OO아파트 101동 1203호'
// '가동'처럼 이미 '동'으로 끝나는 동 이름에는 '동'을 한 번 더 붙이지 않는다.
export const formatDisplayName = (complexName, buildingNo, unitNo) => {
  const building = buildingNo.endsWith('동') ? buildingNo : `${buildingNo}동`;
  const unit = unitNo.endsWith('호') ? unitNo : `${unitNo}호`;
  return `${complexName} ${building} ${unit}`;
};
