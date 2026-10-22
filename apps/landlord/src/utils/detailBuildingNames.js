// juso 상세건물명 목록 → 짧은 표시 글. 서버 apps/api/src/domains/complexes/detailBuildingNames.js의
// formatDetailBuildingRange와 같은 규칙(앱끼리 import하지 않고 옮겨 둔다). 규칙을 바꾸면 양쪽을 함께 고친다.
// - 숫자 동(2개 이상)이 1씩 이어지면 '101동~117동', 그 밖의 이름(상가동 등)은 ' 외 N개'로 붙인다.
// - 아니면 앞 3개 + ' 외 N개'. 빈 목록이면 null.
const collator = new Intl.Collator('ko', { numeric: true });

const NUMBERED_DONG_PATTERN = /^(\d+)동$/;
const PREVIEW_COUNT = 3;

const isConsecutive = (numbers) => numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);

export const formatDetailBuildingRange = (names) => {
  if (!Array.isArray(names) || names.length === 0) return null;
  const sorted = [...names].sort(collator.compare);

  const numbered = sorted.filter((name) => NUMBERED_DONG_PATTERN.test(name));
  const numbers = numbered.map((name) => Number(NUMBERED_DONG_PATTERN.exec(name)[1]));
  if (numbered.length >= 2 && isConsecutive(numbers)) {
    const others = sorted.length - numbered.length;
    const range = `${numbered[0]}~${numbered[numbered.length - 1]}`;
    return others > 0 ? `${range} 외 ${others}개` : range;
  }

  const preview = sorted.slice(0, PREVIEW_COUNT).join(', ');
  return sorted.length > PREVIEW_COUNT ? `${preview} 외 ${sorted.length - PREVIEW_COUNT}개` : preview;
};
