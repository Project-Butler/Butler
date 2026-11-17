-- 시세(실거래가) 표 둘 — 시세 계획서 3절(docs-b/MARKET_PRICE_PLAN.md). 규칙은 domains/marketPrices/marketPriceRules.js
-- CreateEnum
CREATE TYPE "market_deal_type" AS ENUM ('SALE', 'JEONSE', 'MONTHLY');

-- CreateEnum
CREATE TYPE "market_deal_kind" AS ENUM ('TRADE', 'RENT');

-- CreateEnum
CREATE TYPE "market_collection_status" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "market_deals" (
    "id" UUID NOT NULL,
    "deal_kind" "market_deal_kind" NOT NULL,
    "deal_type" "market_deal_type" NOT NULL,
    "sigungu_code" VARCHAR(5) NOT NULL,
    "contract_year_month" CHAR(7) NOT NULL,
    "legal_dong_code" VARCHAR(10),
    "complex_id" UUID,
    "link_method" VARCHAR(10),
    "road_key" VARCHAR(40),
    "lot_key" VARCHAR(40),
    "apt_seq" VARCHAR(20),
    "apt_name" VARCHAR(100),
    "jibun" VARCHAR(20),
    "exclusive_area" DOUBLE PRECISION,
    "floor" INTEGER,
    "contract_date" DATE NOT NULL,
    "price" BIGINT,
    "deposit" BIGINT,
    "monthly_rent" BIGINT,
    "contract_type" VARCHAR(4),
    "collected_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "market_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_collections" (
    "id" UUID NOT NULL,
    "sigungu_code" VARCHAR(5) NOT NULL,
    "year_month" CHAR(7) NOT NULL,
    "deal_kind" "market_deal_kind" NOT NULL,
    "status" "market_collection_status" NOT NULL,
    "deal_count" INTEGER NOT NULL DEFAULT 0,
    "collected_at" TIMESTAMPTZ(3),
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,
    "last_error_code" VARCHAR(30),

    CONSTRAINT "market_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_deals_complex_id_deal_type_contract_date_idx" ON "market_deals"("complex_id", "deal_type", "contract_date");

-- CreateIndex
CREATE INDEX "market_deals_legal_dong_code_deal_type_contract_date_idx" ON "market_deals"("legal_dong_code", "deal_type", "contract_date");

-- CreateIndex
CREATE INDEX "market_deals_sigungu_code_contract_year_month_deal_kind_idx" ON "market_deals"("sigungu_code", "contract_year_month", "deal_kind");

-- CreateIndex
CREATE INDEX "market_collections_attempted_at_idx" ON "market_collections"("attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "market_collections_sigungu_code_year_month_deal_kind_key" ON "market_collections"("sigungu_code", "year_month", "deal_kind");

-- 새 표는 RLS 를 켠다(Prisma 가 넣어 주지 않는다 — README DB 규칙)
ALTER TABLE "market_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_collections" ENABLE ROW LEVEL SECURITY;
