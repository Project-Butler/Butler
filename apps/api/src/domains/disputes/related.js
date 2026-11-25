// 사례 상세 "관련 자료" 고르기. 기준 자료 임베딩과 다른 자료 임베딩의 코사인 유사도로 가까운 순서를 정한다.
// 임베딩은 길이 1로 맞춰 저장되어 있어(embedder.js) 내적이 곧 코사인 유사도다.
// 챗봇 검색(retriever.js)과 계산은 같지만, 그쪽은 상담 담당 코드라 건드리지 않고 따로 둔다.

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

// 후보를 기준 임베딩과 가까운 순서로 limit개 고른다. 결과에서 임베딩은 뺀다.
export const rankBySimilarity = (targetEmbedding, candidates, limit) =>
  candidates
    .map(({ embedding, ...reference }) => ({ reference, similarity: dot(targetEmbedding, embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ reference }) => reference);

// ── 임베딩이 없는 자료의 관련 자료: 검색 점수로 고른다 ──
// 판례 대부분(배포 약 6,800건)은 임베딩이 없어서, 예전에는 같은 분쟁 유형의 최신 3건을 보여 줬다 —
// 같은 유형이면 어느 자료를 열어도 늘 같은 3건이었다. 이제는 그 자료의 키워드와 제목으로 자료 찾기와 같은 검색을 해서
// 관련도 높은 순으로 고르고, 모자라면 같은 유형 최신 자료로 채운다(비용 없음, 임베딩 방식은 그대로).

// 검색어로 쓸 낱말 수. 낱말마다 SQL 조건이 붙어서(조사·동의어 포함) 너무 많으면 느려진다. 8개에 0.3초 안팎.
export const RELATED_QUERY_MAX_WORDS = 8;

// 한글이 두 글자 이상 든 낱말만 쓴다 — 판례 제목의 "甲"·"1."·"■■■"·사건번호 같은 말은 검색에 도움이 안 된다.
const isMeaningfulWord = (word) => /[가-힣].*[가-힣]/.test(word);

// 관련 자료를 찾을 검색어. 키워드(사람이 고른 말)를 먼저 쓰고, 8개가 안 되면 제목 낱말로 채운다 —
// 키워드가 "하자" 하나뿐인 자료가 많아서(세무 판례에 자동으로 붙은 "처분의 하자" 등) 키워드만 쓰면 그런 자료끼리 늘 같은 3건이 나온다.
// 쓸 말이 없으면 ''. clean: 문장부호 정리(service.js cleanSearchKeyword),
// skip: 뺄 말(불용어 "계속"·"경우" 등 — 검색에서 어차피 빠지는데 자리만 차지해서 낱말 수를 세기 전에 뺀다).
export const toRelatedQuery = ({ keywords = [], title = '' }, { clean = (text) => text, skip = () => false } = {}) => {
  const toWords = (text) => clean(text).split(/\s+/).filter((word) => isMeaningfulWord(word) && !skip(word));
  const words = [...toWords(keywords.join(' ')), ...toWords(title)];
  return [...new Set(words)].slice(0, RELATED_QUERY_MAX_WORDS).join(' ');
};

// 검색 결과(ranked) 뒤에 대체 목록(fallback)을 이어 limit개를 고른다. 기준 자료 자신, 기준 자료와 제목이 같은 자료,
// 이미 고른 자료와 제목이 같은 자료는 뺀다 — 판례는 "건물인도"처럼 사건명만 같은 자료가 많아 같은 제목이 줄지어 나오면 고를 수가 없다.
export const pickRelated = ({ target, ranked, fallback, limit }) => {
  const picked = [];
  const seenIds = new Set([target.id]);
  const seenTitles = new Set([target.title]);
  for (const reference of [...ranked, ...fallback]) {
    if (picked.length >= limit) break;
    if (seenIds.has(reference.id) || seenTitles.has(reference.title)) continue;
    seenIds.add(reference.id);
    seenTitles.add(reference.title);
    picked.push(reference);
  }
  return picked;
};

// 겹치는 낱말 점수로 줄 세우기. rows: [{ id, flags: [0|1, …] }] — 낱말마다 그 자료(제목·요약·키워드)에 있으면 1.
// 겹치는 낱말 수가 많은 자료가 먼저이고(자료 찾기 조건 완화와 같음), 같으면 드문 낱말이 겹친 자료가 먼저다 — 낱말마다 IDF 가중치
// (자료 찾기 관련도와 같은 식 log(1 + (N − n + 0.5)/(n + 0.5))). 가중치만 보면 "연기"·"거주"처럼 드문 말 하나만 우연히 겹친 자료가 앞섰다.
// total: 전체 자료 수. 기준 자료(excludeId)는 빼고, 점수가 같으면 id 순(결과가 늘 같게). size개의 id를 돌려준다.
export const rankByWeightedOverlap = ({ rows, total, excludeId, size }) => {
  const termCount = rows[0]?.flags.length ?? 0;
  const docCounts = Array.from({ length: termCount }, (_, index) => rows.filter((row) => row.flags[index]).length);
  const weights = docCounts.map((docCount) => Math.log(1 + (total - docCount + 0.5) / (docCount + 0.5)));
  return rows
    .filter((row) => row.id !== excludeId)
    .map((row) => ({
      id: row.id,
      matched: row.flags.reduce((sum, flag) => sum + flag, 0),
      score: row.flags.reduce((sum, flag, index) => sum + flag * weights[index], 0),
    }))
    .filter((row) => row.matched > 0)
    .sort((a, b) => b.matched - a.matched || b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, size)
    .map((row) => row.id);
};
