// 뉴스 탭 "우리 지역" 칸의 기사 순서: 우리 단지 기사를 맨 위에 먼저(최대 max 건, isComplex 표시),
// 그 아래 시·군·구 · 시·도 묶음에서는 위에 올린 기사와 원문 주소(url)가 같은 기사를 뺀다 — 같은 기사가 두 번 보이지 않게.
// 단지 기사가 없으면 시·군·구 · 시·도 묶음이 받은 그대로 나온다.
export const putComplexNewsFirst = ({ complexItems = [], sigunguItems = [], sidoItems = [], max }) => {
  const top = complexItems.slice(0, max);
  const topUrls = new Set(top.map((item) => item.url));
  const notOnTop = (item) => !topUrls.has(item.url);
  return {
    items: [...top.map((item) => ({ ...item, isComplex: true })), ...sigunguItems.filter(notOnTop)],
    sidoItems: sidoItems.filter(notOnTop),
  };
};
