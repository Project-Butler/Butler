// 동·호 표기 정규화 — 서버 apps/api/src/platform/unitAddress.js와 같은 규칙.
// 등록 직전 확인 문구에 쓴다. 규칙을 바꾸면 양쪽을 함께 고친다.
const stripTrailingSuffix = (value, suffix) => value.replace(new RegExp(`([0-9A-Z])${suffix}$`), '$1');

const normalizeUnitPart = (value, suffix) => {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  const stripped = stripTrailingSuffix(normalized, suffix);
  return stripped === suffix ? '' : stripped;
};

export const normalizeBuildingNo = (value) => normalizeUnitPart(value, '동');

export const normalizeUnitNo = (value) => normalizeUnitPart(value, '호');

// 동·호만. 예: '101동 1203호', 동이 없는 건물(buildingNo '')은 '410호'.
// '가동'처럼 이미 '동'으로 끝나는 동 이름에는 '동'을 한 번 더 붙이지 않는다('410호호'도 만들지 않음).
export const formatUnitLabel = (buildingNo, unitNo) => {
  const unit = unitNo.endsWith('호') ? unitNo : `${unitNo}호`;
  if (!buildingNo) return unit;
  const building = buildingNo.endsWith('동') ? buildingNo : `${buildingNo}동`;
  return `${building} ${unit}`;
};

// 서버 displayName과 같은 모양: '단지명 101동 1203호' / '단지명 410호'
export const formatDisplayName = (complexName, buildingNo, unitNo) => `${complexName} ${formatUnitLabel(buildingNo, unitNo)}`;

// 화면 목록 정렬: (동, 호) 자연 정렬('2동' < '10동', '101호' < '1001호'). 동이 없는 호실이 앞.
const collator = new Intl.Collator('ko', { numeric: true });

export const compareUnits = (a, b) =>
  collator.compare(a.buildingNo ?? '', b.buildingNo ?? '') || collator.compare(a.unitNo ?? '', b.unitNo ?? '');

// 입력한 동(정규화한 값)이 단지의 상세건물명 목록에 있는지. 목록이 비어 있으면 검사하지 않는다(true).
// 목록 값('101동')도 같은 정규화로 맞춰 비교한다.
export const isKnownBuildingNo = (buildingNo, detailBuildingNames) => {
  if (!buildingNo || !Array.isArray(detailBuildingNames) || detailBuildingNames.length === 0) return true;
  return detailBuildingNames.some((name) => normalizeBuildingNo(name) === buildingNo);
};
