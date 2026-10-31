// 분쟁 참고자료 검색(q)의 동의어 사전. 검색 단어가 여기 있으면 짝이 되는 말로도 찾는다(service.js toTermVariants).
// 자료(사례집·판례·법령)는 법률 용어를 쓰고 사용자는 일상어로 검색하는 경우가 많아서 둘을 잇는다.
// 단어는 검색어를 공백으로 나눈 한 단어 단위라 띄어 쓴 말("묵시적 갱신")은 넣지 않는다.

// 서로 같은 뜻: 묶음 안의 어느 말로 검색해도 나머지로도 찾는다.
const SYNONYM_GROUPS = [
  ['월세', '차임', '임대료'],
  ['중개수수료', '중개보수'],
  ['갱신요구권', '갱신청구권'],
  ['묵시적', '묵시의', '법정갱신'],
  ['원상회복', '원상복구'],
  // '보수'는 '중개보수'에도 걸려서 넣지 않는다.
  ['수선', '수리'],
  ['전세금', '전세보증금'],
  ['하자', '결함'],
  ['반려동물', '애완동물'],
  ['흡연', '담배'],
  ['전대', '재임대'],
];

// 한 방향: 일상어로 검색하면 자료에 쓰인 말로도 찾는다. 반대 방향은 하지 않는다 —
// '가게'는 다른 말 속에 섞여 걸리기 쉬워 다른 말의 동의어로는 쓰지 않는다.
const ONE_WAY_SYNONYMS = {
  집주인: ['임대인'],
  건물주: ['임대인'],
  세입자: ['임차인'],
  가게: ['상가', '점포'],
  점포: ['상가'],
  전입신고: ['주민등록'],
  퇴거: ['명도'],
};

// 바꿔 찾기: 이 말은 그대로 찾지 않고 대신 오른쪽 말로만 찾는다.
// '복비'는 자료에서 '원상회복비' 속에만 나와서(26건 모두) 그대로 찾으면 엉뚱한 자료만 걸린다.
const REPLACEMENTS = {
  복비: ['중개보수', '중개수수료'],
};

// 검색 단어를 실제로 찾을 말로 바꾼다. 바꿀 말이 없으면 그대로 [word].
export const replaceSearchWord = (word) => REPLACEMENTS[word] ?? [word];

const buildSynonymMap = () => {
  const map = new Map(Object.entries(ONE_WAY_SYNONYMS));
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      map.set(word, [...new Set([...(map.get(word) ?? []), ...group.filter((other) => other !== word)])]);
    }
  }
  return map;
};

const SYNONYMS = buildSynonymMap();

// 단어의 동의어 목록(자기 자신은 빼고). 없으면 [].
export const findSynonyms = (word) => SYNONYMS.get(word) ?? [];
