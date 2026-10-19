-- AlterTable
ALTER TABLE "kapt_complexes" ADD COLUMN     "basis_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "basis_error" TEXT,
ADD COLUMN     "basis_fetched_at" TIMESTAMPTZ(3),
ADD COLUMN     "jibun_address" TEXT,
ADD COLUMN     "main_lot" INTEGER,
ADD COLUMN     "road_address" TEXT,
ADD COLUMN     "road_main_no" INTEGER,
ADD COLUMN     "road_name_key" TEXT,
ADD COLUMN     "road_sigungu_cd" VARCHAR(5),
ADD COLUMN     "road_sub_no" INTEGER,
ADD COLUMN     "road_underground" BOOLEAN,
ADD COLUMN     "sub_lot" INTEGER;

-- CreateTable
CREATE TABLE "complex_source_aliases" (
    "source_key" VARCHAR(50) NOT NULL,
    "complex_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complex_source_aliases_pkey" PRIMARY KEY ("source_key")
);

-- CreateTable
CREATE TABLE "complex_building_lookups" (
    "complex_id" UUID NOT NULL,
    "dong_key" VARCHAR(20) NOT NULL,
    "pnu" VARCHAR(19) NOT NULL,
    "registry_dong_nm" TEXT,
    "ho_format" VARCHAR(20) NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "miss_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complex_building_lookups_pkey" PRIMARY KEY ("complex_id","dong_key")
);

-- CreateTable
CREATE TABLE "complex_lookup_misses" (
    "complex_id" UUID NOT NULL,
    "dong_key" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(50),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complex_lookup_misses_pkey" PRIMARY KEY ("complex_id","dong_key")
);

-- CreateTable
CREATE TABLE "external_api_usage" (
    "api" VARCHAR(30) NOT NULL,
    "usage_date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "external_api_usage_pkey" PRIMARY KEY ("api","usage_date")
);

-- CreateIndex
CREATE INDEX "complex_source_aliases_complex_id_idx" ON "complex_source_aliases"("complex_id");

-- CreateIndex
CREATE INDEX "complex_lookup_misses_expires_at_idx" ON "complex_lookup_misses"("expires_at");

-- CreateIndex
CREATE INDEX "kapt_complexes_road_sigungu_cd_road_name_key_road_main_no_r_idx" ON "kapt_complexes"("road_sigungu_cd", "road_name_key", "road_main_no", "road_sub_no");

-- CreateIndex
CREATE INDEX "kapt_complexes_legal_dong_code_main_lot_idx" ON "kapt_complexes"("legal_dong_code", "main_lot");

-- AddForeignKey
ALTER TABLE "complex_source_aliases" ADD CONSTRAINT "complex_source_aliases_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complex_building_lookups" ADD CONSTRAINT "complex_building_lookups_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complex_lookup_misses" ADD CONSTRAINT "complex_lookup_misses_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- 기존 단지의 sourceKey를 별칭으로 복사한다(complexes.source_key는 그대로 둔다).
INSERT INTO "complex_source_aliases" ("source_key", "complex_id", "created_at")
SELECT "source_key", "id", "created_at" FROM "complexes" WHERE "source_key" IS NOT NULL
ON CONFLICT ("source_key") DO NOTHING;

-- 새 테이블은 Supabase Data API로 열리지 않게 RLS를 켠다(README "DB 작업 규칙"). 정책은 두지 않는다.
ALTER TABLE "complex_source_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complex_building_lookups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complex_lookup_misses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_api_usage" ENABLE ROW LEVEL SECURITY;
