-- Step 0 스키마를 ERD에 맞게 보강 (Issue #8)
-- `prisma migrate diff`로 뽑은 SQL을 기반으로 손으로 고쳤다. 고친 곳은 "손으로 수정:" 주석으로 표시한다.
-- 손으로 수정: Prisma는 TEXT -> UUID를 "DROP COLUMN 후 ADD COLUMN"으로 만든다(값이 모두 사라지고,
--   행이 있는 dispute_references에서는 실패). 모두 "SET DATA TYPE UUID USING (...::uuid)"로 바꿨다.
--   컬럼을 지우지 않으므로 PK·인덱스는 그대로 유지되어 PK DROP/ADD와 인덱스 재생성 줄도 뺐다.
--   FK 제약만 먼저 지웠다가 타입을 바꾼 뒤 다시 만든다.

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_ownership_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_property_id_fkey";

-- DropForeignKey
ALTER TABLE "properties" DROP CONSTRAINT "properties_complex_id_fkey";

-- DropForeignKey
ALTER TABLE "property_ownerships" DROP CONSTRAINT "property_ownerships_property_id_fkey";

-- DropForeignKey
ALTER TABLE "property_ownerships" DROP CONSTRAINT "property_ownerships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_property_id_fkey";

-- AlterTable
-- 손으로 수정: password는 DROP/ADD 대신 이름만 바꾼다(기존 해시 보존).
ALTER TABLE "users" RENAME COLUMN "password" TO "password_hash";

-- AlterTable
-- 손으로 수정: updated_at(NOT NULL, DB 기본값 없음)은 기존 행이 있어도 실패하지 않도록
--   기본값을 잠깐 넣었다가 지운다. 이후 값은 Prisma @updatedAt이 채운다.
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspend_reason" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMPTZ(3),
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "withdrawn_at" TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "regions" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "complexes" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ADD COLUMN     "created_by_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "complexes" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "properties" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ALTER COLUMN "complex_id" SET DATA TYPE UUID USING ("complex_id"::uuid),
ALTER COLUMN "building_no" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "unit_no" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "exclusive_area" SET DATA TYPE DECIMAL(8,2),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "property_ownerships" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ALTER COLUMN "property_id" SET DATA TYPE UUID USING ("property_id"::uuid),
ALTER COLUMN "user_id" SET DATA TYPE UUID USING ("user_id"::uuid),
ADD COLUMN     "end_note" TEXT,
ADD COLUMN     "evidence_document_id" UUID,
ADD COLUMN     "verification_attempt_id" TEXT,
ALTER COLUMN "verified_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "verification_expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ended_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ALTER COLUMN "ownership_id" SET DATA TYPE UUID USING ("ownership_id"::uuid),
ALTER COLUMN "tenant_id" SET DATA TYPE UUID USING ("tenant_id"::uuid),
ALTER COLUMN "previous_contract_id" SET DATA TYPE UUID USING ("previous_contract_id"::uuid),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ALTER COLUMN "property_id" SET DATA TYPE UUID USING ("property_id"::uuid),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ALTER COLUMN "property_id" SET DATA TYPE UUID USING ("property_id"::uuid),
ALTER COLUMN "uploaded_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "rate_limit_counters" ALTER COLUMN "window_start" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable (C팀 dispute_references — 59건 보존)
ALTER TABLE "dispute_references" ALTER COLUMN "id" SET DATA TYPE UUID USING ("id"::uuid),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "error" JSONB,
    "requested_by_user_id" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "jobs_requested_by_user_id_idx" ON "jobs"("requested_by_user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 손으로 수정: ERD 20p 부분 인덱스. Prisma schema로 표현할 수 없어 SQL로만 둔다.
-- 같은 호실에 한 사용자의 활성 소유 관계(ended_at IS NULL)는 하나만
CREATE UNIQUE INDEX "uq_ownership_active_user" ON "property_ownerships" ("property_id", "user_id") WHERE "ended_at" IS NULL;
-- 워커가 대기 작업을 run_after 순으로 집어 간다
CREATE INDEX "ix_jobs_pending" ON "jobs" ("run_after") WHERE "status" = 'PENDING';
