-- CreateTable
CREATE TABLE "kapt_complexes" (
    "kapt_code" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "legal_dong_code" VARCHAR(10) NOT NULL,
    "sido_name" TEXT,
    "sigungu_name" TEXT,
    "dong_name" TEXT,
    "ri_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kapt_complexes_pkey" PRIMARY KEY ("kapt_code")
);

-- CreateIndex
CREATE INDEX "kapt_complexes_legal_dong_code_idx" ON "kapt_complexes"("legal_dong_code");


-- 새 테이블은 Supabase Data API로 열리지 않게 RLS를 켠다(README "DB 작업 규칙"). 정책은 두지 않는다.
ALTER TABLE "kapt_complexes" ENABLE ROW LEVEL SECURITY;
