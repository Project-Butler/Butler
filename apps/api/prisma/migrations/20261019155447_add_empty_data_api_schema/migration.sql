-- Supabase Data API(PostgREST)에 공개할 빈 스키마 (Issue #16).
-- Data API를 끄면 Supabase가 존재하지 않는 스키마(pg_pgrst_no_exposed_schemas)를 공개 대상으로 넣어
-- PostgREST가 약 32초마다 3F000 에러 로그를 남긴다. 대신 이 빈 스키마 하나만 공개해서 에러를 없앤다.
-- 이 스키마에는 테이블·뷰·함수를 만들지 않고 권한도 주지 않는다 → Data API로 조회할 수 있는 것이 없다.
-- 앱 테이블은 계속 public에 있고, public은 Data API에 공개하지 않는다.
-- 직접 작성한 마이그레이션이다(Prisma는 public 스키마만 관리한다).

CREATE SCHEMA IF NOT EXISTS "data_api";
