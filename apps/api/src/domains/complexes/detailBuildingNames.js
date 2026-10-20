// juso 상세건물명 목록(detBdNmList) 처리(순수 함수, DB·외부 호출 없음).
// juso는 목록을 순서 없이 준다('103동,117동,107동,…') — 자연 정렬('2동' < '10동')해서 보관한다.

const collator = new Intl.Collator('ko', { numeric: true });

// '103동,101동, 102동' → ['101동', '102동', '103동'](공백 제거, 중복 제거, 자연 정렬)
export const parseDetailBuildingNames = (value) =>
  [
    ...new Set(
      String(value ?? '')
        .split(',')
        .map((name) => name.replace(/\s+/g, ''))
        .filter(Boolean),
    ),
  ].sort(collator.compare);

const NUMBERED_DONG_PATTERN = /^(\d+)동$/;
const PREVIEW_COUNT = 3;

const isConsecutive = (numbers) => numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);

// 목록 표시용 짧은 글. 화면(apps/landlord)도 같은 규칙으로 보여 준다. 빈 목록이면 null.
// - 숫자 동(2개 이상)이 1씩 이어지면 '101동~117동', 그 밖의 이름(상가동 등)은 ' 외 N개'로 붙인다.
// - 아니면 앞 3개 + ' 외 N개'.
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
