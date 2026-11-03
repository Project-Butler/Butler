-- 챗봇 RAG 검색을 서버 계산에서 pgvector로 옮긴다. 이미 만든 임베딩은 그대로 옮긴다(재계산 불필요).
CREATE EXTENSION IF NOT EXISTS vector;

-- 768차원이 아닌 값(빈 배열 등)은 vector(768)로 바꿀 수 없어 NULL로 둔다. embed:disputes -- --missing이 다시 채운다.
ALTER TABLE "dispute_references"
  ALTER COLUMN "embedding" TYPE vector(768)
  USING (CASE WHEN cardinality("embedding") = 768 THEN "embedding"::vector(768) END);
