-- 노션 6번 Prisma 스키마 이름 규칙에 맞춘 정렬.
-- 테이블·컬럼·enum 이름만 바꾸므로 데이터는 그대로 남는다(DROP/CREATE 없음).
-- 이름이 바뀐 테이블의 PK·FK·인덱스 이름도 Prisma 기본 이름으로 맞춘다(안 맞추면 다음 migrate dev에서 drift).

-- ── enum ──────────────────────────────────────────────
ALTER TYPE "ownership_verification_status" RENAME TO "verification_status";
ALTER TYPE "ownership_end_reason" RENAME TO "end_reason";
ALTER TYPE "ticket_status" ADD VALUE IF NOT EXISTS 'CANCELED';

-- ── property_ownerships → ownerships ──────────────────
ALTER TABLE "property_ownerships" RENAME TO "ownerships";
ALTER TABLE "ownerships" RENAME COLUMN "verification_attempt_id" TO "check_id";
ALTER TABLE "ownerships" RENAME CONSTRAINT "property_ownerships_pkey" TO "ownerships_pkey";
ALTER TABLE "ownerships" RENAME CONSTRAINT "property_ownerships_property_id_fkey" TO "ownerships_property_id_fkey";
ALTER TABLE "ownerships" RENAME CONSTRAINT "property_ownerships_user_id_fkey" TO "ownerships_user_id_fkey";
ALTER INDEX "property_ownerships_property_id_idx" RENAME TO "ownerships_property_id_idx";
ALTER INDEX "property_ownerships_user_id_idx" RENAME TO "ownerships_user_id_idx";

-- 한 호실에 인증된 활성 소유 관계는 1개 (노션 6번 16장)
CREATE UNIQUE INDEX "uq_ownership_verified" ON "ownerships" ("property_id")
  WHERE "ended_at" IS NULL AND "verification_status" = 'VERIFIED';

-- ── regions / complexes ───────────────────────────────
ALTER TABLE "regions" RENAME COLUMN "legal_dong_code" TO "id";
ALTER TABLE "complexes" RENAME COLUMN "legal_dong_code" TO "region_id";
ALTER TABLE "complexes" RENAME CONSTRAINT "complexes_legal_dong_code_fkey" TO "complexes_region_id_fkey";
ALTER TABLE "complexes" RENAME COLUMN "official_building_name" TO "building_name";
ALTER TABLE "complexes" RENAME COLUMN "detail_building_names" TO "dong_names";

-- ── landlord_buildings → my_buildings ─────────────────
ALTER TABLE "landlord_buildings" RENAME TO "my_buildings";
ALTER TABLE "my_buildings" RENAME CONSTRAINT "landlord_buildings_pkey" TO "my_buildings_pkey";
ALTER TABLE "my_buildings" RENAME CONSTRAINT "landlord_buildings_complex_id_fkey" TO "my_buildings_complex_id_fkey";
ALTER TABLE "my_buildings" RENAME CONSTRAINT "landlord_buildings_user_id_fkey" TO "my_buildings_user_id_fkey";
ALTER INDEX "landlord_buildings_complex_id_idx" RENAME TO "my_buildings_complex_id_idx";
ALTER INDEX "landlord_buildings_user_id_complex_id_key" RENAME TO "my_buildings_user_id_complex_id_key";

-- ── activity_logs → activities ────────────────────────
ALTER TABLE "activity_logs" RENAME TO "activities";
ALTER TABLE "activities" RENAME CONSTRAINT "activity_logs_pkey" TO "activities_pkey";
ALTER TABLE "activities" RENAME CONSTRAINT "activity_logs_user_id_fkey" TO "activities_user_id_fkey";
ALTER INDEX "activity_logs_user_id_created_at_idx" RENAME TO "activities_user_id_created_at_idx";

-- ── external_api_usage → api_usages ───────────────────
ALTER TABLE "external_api_usage" RENAME TO "api_usages";
ALTER TABLE "api_usages" RENAME CONSTRAINT "external_api_usage_pkey" TO "api_usages_pkey";

-- ── reference_data_imports → data_imports ─────────────
ALTER TABLE "reference_data_imports" RENAME TO "data_imports";
ALTER TABLE "data_imports" RENAME CONSTRAINT "reference_data_imports_pkey" TO "data_imports_pkey";
ALTER INDEX "reference_data_imports_source_status_file_date_idx" RENAME TO "data_imports_source_status_file_date_idx";
ALTER INDEX "uq_reference_data_imports_running_lock" RENAME TO "uq_data_imports_running_lock";
ALTER INDEX "uq_reference_data_imports_delta_succeeded" RENAME TO "uq_data_imports_delta_succeeded";

-- ── address_search_results → address_caches ───────────
ALTER TABLE "address_search_results" RENAME TO "address_caches";
ALTER TABLE "address_caches" RENAME CONSTRAINT "address_search_results_pkey" TO "address_caches_pkey";
ALTER INDEX "address_search_results_fetched_at_idx" RENAME TO "address_caches_fetched_at_idx";

-- ── jobs ──────────────────────────────────────────────
ALTER TABLE "jobs" RENAME COLUMN "requested_by_user_id" TO "requested_by_id";
ALTER TABLE "jobs" RENAME CONSTRAINT "jobs_requested_by_user_id_fkey" TO "jobs_requested_by_id_fkey";
ALTER INDEX "jobs_requested_by_user_id_idx" RENAME TO "jobs_requested_by_id_idx";

-- ── rate_limit_counters → rate_limits ─────────────────
-- 카운터는 일시 데이터라 만료 시각이 없던 기존 행은 지금부터 1시간(가장 긴 한도 창)으로 둔다.
ALTER TABLE "rate_limit_counters" RENAME TO "rate_limits";
ALTER TABLE "rate_limits" RENAME COLUMN "key" TO "id";
ALTER TABLE "rate_limits" RENAME CONSTRAINT "rate_limit_counters_pkey" TO "rate_limits_pkey";
ALTER TABLE "rate_limits" ADD COLUMN "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now() + interval '1 hour';
ALTER TABLE "rate_limits" ALTER COLUMN "expires_at" DROP DEFAULT;

-- ── documents ─────────────────────────────────────────
ALTER TABLE "documents" RENAME COLUMN "uploaded_at" TO "created_at";
