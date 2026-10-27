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
