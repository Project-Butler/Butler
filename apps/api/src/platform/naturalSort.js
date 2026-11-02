// 동·호 자연 정렬('2동' < '10동', '201' < '1001'). DB 정렬(문자열 순)로는 이 순서가 안 나와서 JS로 한다.
const collator = new Intl.Collator('ko', { numeric: true });

export const compareNatural = (a, b) => collator.compare(a ?? '', b ?? '');

// summary: { complex: { id, name }, buildingNo, unitNo }. 단지 이름 → 단지 id → 동 → 호.
// complexId로 거른 목록이면 (동, 호) 순서와 같다.
export const compareUnits = (a, b) =>
  compareNatural(a.complex.name, b.complex.name) ||
  compareNatural(a.complex.id, b.complex.id) ||
  compareNatural(a.buildingNo, b.buildingNo) ||
  compareNatural(a.unitNo, b.unitNo);
