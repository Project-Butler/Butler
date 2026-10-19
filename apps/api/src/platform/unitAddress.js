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

const toCompactUpper = (value) =>
  value
    .normalize('NFKC') // 전각 숫자·라틴 → 반각
    .replace(/\s+/g, '')
    .toUpperCase(); // 한글에는 영향이 없고 라틴만 대문자가 된다

// '동'·'호'만 입력한 경우는 값이 없는 것으로 본다(호출 쪽 길이 검사에서 거부됨).
const stripSuffixOrEmpty = (value, suffix) => {
  const stripped = stripTrailingSuffix(value, suffix);
  return stripped === suffix ? '' : stripped;
};

// 건축물대장 표기 '제103동'·'주건축물제103동'도 '103'으로 맞춘다.
// 앞 글자는 바로 뒤가 숫자·라틴일 때만 뗀다('제일동' 같은 한글 이름은 그대로).
export const normalizeBuildingNo = (value) => {
  if (typeof value !== 'string') return '';
  const compact = toCompactUpper(value)
    .replace(/^주건축물(?=제?[0-9A-Z])/, '')
    .replace(/^제(?=[0-9A-Z])/, '');
  return stripSuffixOrEmpty(compact, '동');
};

// '3층310호' → '310'(앞의 층 표기), buildingNo를 주면 '101동 303호' → '303'(앞의 같은 동 표기)도 뗀다.
// 다른 동이 앞에 붙어 있으면 떼지 않는다 — isCombinedUnitAddress로 거부된다.
export const normalizeUnitNo = (value, buildingNo) => {
  if (typeof value !== 'string') return '';
  let compact = toCompactUpper(value);

  const dongPrefix = /^([0-9A-Z]+)동(?=[0-9A-Z])/.exec(compact);
  if (dongPrefix && buildingNo !== undefined && dongPrefix[1] === normalizeBuildingNo(buildingNo)) {
    compact = compact.slice(dongPrefix[0].length);
  }
  compact = compact.replace(/^\d{1,3}층(?=\d)/, '');
  return stripSuffixOrEmpty(compact, '호');
};

// 동·호를 한 칸에 적은 값('101-1203', '101동1203호')인지. 정규화한 값을 넘긴다.
// 호 부분이 3자리 이상일 때만 본다('101-1'처럼 동 이름에 붙은 번호는 허용).
const COMBINED_UNIT_ADDRESS_PATTERN = /^[0-9A-Z]+(?:-|동)\d{3,}호?$/;

export const isCombinedUnitAddress = (normalized) => COMBINED_UNIT_ADDRESS_PATTERN.test(normalized);

export const COMBINED_UNIT_ADDRESS_REASON = '동과 호를 나눠 입력해 주세요';

// 화면 표시용 이름. 예: formatDisplayName('잠실OO아파트', '101', '1203') → '잠실OO아파트 101동 1203호'
// '가동'처럼 이미 '동'으로 끝나는 동 이름에는 '동'을 한 번 더 붙이지 않는다.
export const formatDisplayName = (complexName, buildingNo, unitNo) => {
  const building = buildingNo.endsWith('동') ? buildingNo : `${buildingNo}동`;
  const unit = unitNo.endsWith('호') ? unitNo : `${unitNo}호`;
  return `${complexName} ${building} ${unit}`;
};
