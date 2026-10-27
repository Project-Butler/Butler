-- 공식 연계(JUSO_LINK)도 건물DB 일변동분(JUSO_DELTA)처럼 날짜마다 성공 1번.
-- 표·칸 변경 없음. 부분 유니크 인덱스의 출처 조건만 넓힌다(손으로 넣은 인덱스라 Prisma 스키마에는 없음).
DROP INDEX IF EXISTS "uq_reference_data_imports_delta_succeeded";
CREATE UNIQUE INDEX "uq_reference_data_imports_delta_succeeded" ON "reference_data_imports"("source", "file_date")
  WHERE "status" = 'SUCCEEDED' AND "source" IN ('JUSO_DELTA', 'JUSO_LINK');
