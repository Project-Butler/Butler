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

// buildingNo·unitNo는 normalize를 거친 값(끝의 '동'·'호'가 없음)만 받는다.
export const formatDisplayName = (complexName, buildingNo, unitNo) => `${complexName} ${buildingNo}동 ${unitNo}호`;
