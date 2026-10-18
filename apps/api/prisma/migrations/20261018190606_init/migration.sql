-- CreateEnum
CREATE TYPE "role" AS ENUM ('LANDLORD', 'TENANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ownership_verification_status" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ownership_end_reason" AS ENUM ('SELF_ENDED', 'SUPERSEDED', 'ADMIN_ENDED');

-- CreateEnum
CREATE TYPE "lease_type" AS ENUM ('MONTHLY', 'JEONSE');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "dispute_reference_type" AS ENUM ('CASE', 'PRECEDENT', 'GUIDELINE');

-- CreateEnum
CREATE TYPE "dispute_property_kind" AS ENUM ('HOUSING', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "dispute_category" AS ENUM ('RENT_ADJUSTMENT', 'LEASE_TERM', 'DEPOSIT_RETURN', 'REPAIR_DUTY', 'CONTRACT_INTERPRETATION', 'RENEWAL_TERMINATION', 'DAMAGES', 'BROKERAGE_FEE', 'PREMIUM', 'GENERAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "legal_dong_code" TEXT NOT NULL,
    "sido_name" TEXT NOT NULL,
    "sigungu_name" TEXT NOT NULL,
    "dong_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("legal_dong_code")
);

-- CreateTable
CREATE TABLE "complexes" (
    "id" TEXT NOT NULL,
    "source_key" TEXT,
    "name" TEXT NOT NULL,
    "jibun_address" TEXT,
    "road_address" TEXT,
    "legal_dong_code" TEXT NOT NULL,
    "approval_date" DATE,
    "household_count" INTEGER,
    "building_count" INTEGER,
    "max_floor" INTEGER,
    "parking_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "complex_id" TEXT NOT NULL,
    "building_no" TEXT NOT NULL,
    "unit_no" TEXT NOT NULL,
    "exclusive_area" DOUBLE PRECISION,
    "floor" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_ownerships" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "acquired_year_month" TEXT,
    "purchase_price" BIGINT,
    "verification_status" "ownership_verification_status" NOT NULL DEFAULT 'UNVERIFIED',
    "verified_at" TIMESTAMP(3),
    "verification_expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "end_reason" "ownership_end_reason",

    CONSTRAINT "property_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "ownership_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "tenant_name" TEXT NOT NULL,
    "tenant_phone" TEXT NOT NULL,
    "lease_type" "lease_type" NOT NULL,
    "deposit" BIGINT NOT NULL,
    "monthly_rent" BIGINT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "terminated_on" DATE,
    "termination_reason" TEXT,
    "previous_contract_id" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "dispute_references" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "type" "dispute_reference_type" NOT NULL,
    "property_kind" "dispute_property_kind",
    "category" "dispute_category" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outcome" TEXT,
    "case_number" TEXT,
    "related_laws" TEXT[],
    "keywords" TEXT[],
    "source_title" TEXT NOT NULL,
    "source_page" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispute_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "complexes_source_key_key" ON "complexes"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "properties_complex_id_building_no_unit_no_key" ON "properties"("complex_id", "building_no", "unit_no");

-- CreateIndex
CREATE INDEX "property_ownerships_property_id_idx" ON "property_ownerships"("property_id");

-- CreateIndex
CREATE INDEX "property_ownerships_user_id_idx" ON "property_ownerships"("user_id");

-- CreateIndex
CREATE INDEX "contracts_ownership_id_idx" ON "contracts"("ownership_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_idx" ON "contracts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_references_source_key_key" ON "dispute_references"("source_key");

-- CreateIndex
CREATE INDEX "dispute_references_type_category_idx" ON "dispute_references"("type", "category");

-- AddForeignKey
ALTER TABLE "complexes" ADD CONSTRAINT "complexes_legal_dong_code_fkey" FOREIGN KEY ("legal_dong_code") REFERENCES "regions"("legal_dong_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownerships" ADD CONSTRAINT "property_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "property_ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
