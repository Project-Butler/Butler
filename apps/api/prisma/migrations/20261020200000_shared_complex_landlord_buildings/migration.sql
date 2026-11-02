-- A-12 재설계: 단지 = juso 도로명주소 하나(공유) + 임대인 개인 건물 설정 + 참고 데이터 연결 표.
-- 예전 KAPT:/PNU: 키 단지가 남아 있으면 새 ROAD: 키 체계와 섞이므로 멈춘다.
-- (로컬은 DB를 새로 만들고, Supabase는 반영 전에 pg_dump 뒤 비어 있는지 확인한다.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "complexes")
     OR EXISTS (SELECT 1 FROM "properties")
     OR EXISTS (SELECT 1 FROM "property_ownerships") THEN
    RAISE EXCEPTION 'complexes/properties/property_ownerships에 행이 있습니다. 예전 단지 키 데이터를 정리한 뒤 다시 실행하세요.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "complexes" ADD COLUMN     "building_main_no" INTEGER,
ADD COLUMN     "building_mgt_no" VARCHAR(25),
ADD COLUMN     "building_sub_no" INTEGER,
ADD COLUMN     "detail_building_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_mountain" BOOLEAN,
ADD COLUMN     "is_underground" BOOLEAN,
ADD COLUMN     "kapt_code" VARCHAR(20),
ADD COLUMN     "main_lot" INTEGER,
ADD COLUMN     "official_building_name" VARCHAR(100),
ADD COLUMN     "road_code" VARCHAR(12),
ADD COLUMN     "road_name" VARCHAR(80),
ADD COLUMN     "road_name_key" TEXT,
ADD COLUMN     "sigungu_code" VARCHAR(5),
ADD COLUMN     "sub_lot" INTEGER,
ADD COLUMN     "zip_code" VARCHAR(5);

-- AlterTable
ALTER TABLE "kapt_complexes" ADD COLUMN     "approval_date" DATE,
ADD COLUMN     "basis_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "basis_error" TEXT,
ADD COLUMN     "basis_fetched_at" TIMESTAMPTZ(3),
ADD COLUMN     "basis_file_date" DATE,
ADD COLUMN     "basis_source" VARCHAR(10),
ADD COLUMN     "building_count" INTEGER,
ADD COLUMN     "household_count" INTEGER,
ADD COLUMN     "jibun_address" TEXT,
ADD COLUMN     "main_lot" INTEGER,
ADD COLUMN     "road_address" TEXT,
ADD COLUMN     "sale_type" VARCHAR(20),
ADD COLUMN     "sub_lot" INTEGER;

-- AlterTable
ALTER TABLE "property_ownerships" ADD COLUMN     "equipment" VARCHAR(30)[] DEFAULT ARRAY[]::VARCHAR(30)[],
ADD COLUMN     "equipment_etc" VARCHAR(200),
ADD COLUMN     "unit_type" VARCHAR(20);

-- CreateTable
CREATE TABLE "landlord_buildings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "complex_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "capacity" INTEGER,
    "memo" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "landlord_buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "complex_id" UUID,
    "property_id" UUID,
    "params" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_api_usage" (
    "api" VARCHAR(30) NOT NULL,
    "usage_date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "external_api_usage_pkey" PRIMARY KEY ("api","usage_date")
);

-- CreateTable
CREATE TABLE "kapt_address_links" (
    "source" VARCHAR(20) NOT NULL,
    "road_sigungu_cd" VARCHAR(5) NOT NULL,
    "road_name_key" TEXT NOT NULL,
    "road_underground" BOOLEAN NOT NULL,
    "road_main_no" INTEGER NOT NULL,
    "road_sub_no" INTEGER NOT NULL,
    "kapt_code" VARCHAR(20) NOT NULL,
    "import_run_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kapt_address_links_pkey" PRIMARY KEY ("source","road_sigungu_cd","road_name_key","road_underground","road_main_no","road_sub_no","kapt_code")
);

-- CreateTable
CREATE TABLE "juso_building_links" (
    "building_mgt_no" VARCHAR(25) NOT NULL,
    "road_sigungu_cd" VARCHAR(5) NOT NULL,
    "road_name_key" TEXT NOT NULL,
    "road_underground" BOOLEAN NOT NULL,
    "road_main_no" INTEGER NOT NULL,
    "road_sub_no" INTEGER NOT NULL,
    "road_code" VARCHAR(12),
    "kapt_code" VARCHAR(20) NOT NULL,
    "match_rule" VARCHAR(20) NOT NULL,
    "import_run_id" UUID,
    "applied_file_date" DATE,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "juso_building_links_pkey" PRIMARY KEY ("building_mgt_no")
);

-- CreateTable
CREATE TABLE "reference_data_imports" (
    "id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "lock_key" VARCHAR(100) NOT NULL,
    "file_name" TEXT,
    "file_date" DATE,
    "file_size" BIGINT,
    "file_sha1" CHAR(40),
    "status" VARCHAR(10) NOT NULL,
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "rows_written" INTEGER NOT NULL DEFAULT 0,
    "cursor_line" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "reference_data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_search_results" (
    "source_key" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_search_results_pkey" PRIMARY KEY ("source_key")
);

-- CreateIndex
CREATE INDEX "landlord_buildings_complex_id_idx" ON "landlord_buildings"("complex_id");

-- CreateIndex
CREATE UNIQUE INDEX "landlord_buildings_user_id_complex_id_key" ON "landlord_buildings"("user_id", "complex_id");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "kapt_address_links_road_sigungu_cd_road_name_key_road_under_idx" ON "kapt_address_links"("road_sigungu_cd", "road_name_key", "road_underground", "road_main_no", "road_sub_no");

-- CreateIndex
CREATE INDEX "kapt_address_links_kapt_code_idx" ON "kapt_address_links"("kapt_code");

-- CreateIndex
CREATE INDEX "juso_building_links_road_sigungu_cd_road_name_key_road_unde_idx" ON "juso_building_links"("road_sigungu_cd", "road_name_key", "road_underground", "road_main_no", "road_sub_no");

-- CreateIndex
CREATE INDEX "juso_building_links_kapt_code_idx" ON "juso_building_links"("kapt_code");

-- CreateIndex
CREATE INDEX "reference_data_imports_source_status_file_date_idx" ON "reference_data_imports"("source", "status", "file_date");

-- CreateIndex
CREATE INDEX "address_search_results_fetched_at_idx" ON "address_search_results"("fetched_at");

-- CreateIndex
CREATE INDEX "complexes_sigungu_code_road_name_key_is_underground_buildin_idx" ON "complexes"("sigungu_code", "road_name_key", "is_underground", "building_main_no", "building_sub_no");

-- CreateIndex
CREATE INDEX "complexes_building_mgt_no_idx" ON "complexes"("building_mgt_no");

-- CreateIndex
CREATE INDEX "complexes_kapt_code_idx" ON "complexes"("kapt_code");

-- CreateIndex
CREATE INDEX "kapt_complexes_legal_dong_code_main_lot_idx" ON "kapt_complexes"("legal_dong_code", "main_lot");

-- AddForeignKey
ALTER TABLE "landlord_buildings" ADD CONSTRAINT "landlord_buildings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_buildings" ADD CONSTRAINT "landlord_buildings_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prisma로 표현하지 못하는 인덱스(손으로 넣음).
-- 실행 단위 잠금: 같은 표에 쓰는 가져오기는 동시에 하나만 RUNNING.
CREATE UNIQUE INDEX "uq_reference_data_imports_running_lock" ON "reference_data_imports"("lock_key") WHERE "status" = 'RUNNING';
-- 변동분은 파일 날짜마다 성공 1번.
CREATE UNIQUE INDEX "uq_reference_data_imports_delta_succeeded" ON "reference_data_imports"("source", "file_date") WHERE "status" = 'SUCCEEDED' AND "source" = 'JUSO_DELTA';
-- 같은 필지(건물관리번호 앞 19자리 = PNU)의 다른 건물 찾기.
CREATE INDEX "ix_juso_building_links_parcel" ON "juso_building_links"(substr("building_mgt_no", 1, 19));

-- 새 테이블은 Supabase Data API로 열리지 않게 RLS를 켠다(README "DB 작업 규칙"). 정책은 두지 않는다.
ALTER TABLE "landlord_buildings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_api_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kapt_address_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "juso_building_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reference_data_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "address_search_results" ENABLE ROW LEVEL SECURITY;
