-- 노션 5번 API Spec 8·10장: 감사 로그(audit_logs). 쓰기는 platform/audit.js의 audit.record()로만 한다.
-- resource_type + resource_id로 아무 리소스나 가리키므로 FK가 없다.

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "resource_type" VARCHAR(40) NOT NULL,
    "resource_id" UUID,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "request_id" UUID,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Supabase Data API로 열리지 않게 (정책은 만들지 않는다)
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);
