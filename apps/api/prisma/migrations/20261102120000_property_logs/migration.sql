-- 관리 로그(하우스 로그, 계약 5장). 기존 행을 바꾸지 않는 추가 변경이다.
CREATE TYPE "property_log_scope" AS ENUM ('PRIVATE', 'PROPERTY_HISTORY');

CREATE TABLE "property_logs" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "ownership_id" UUID NOT NULL,
    "author_id" UUID,
    "scope" "property_log_scope" NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT,
    "occurred_on" DATE NOT NULL,
    "cost" BIGINT,
    "source_feature" VARCHAR(40) NOT NULL DEFAULT 'platform',
    "source_resource_type" VARCHAR(40),
    "source_resource_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "property_logs_property_id_scope_occurred_on_idx" ON "property_logs"("property_id", "scope", "occurred_on" DESC);
CREATE INDEX "property_logs_ownership_id_occurred_on_idx" ON "property_logs"("ownership_id", "occurred_on" DESC);
CREATE INDEX "property_logs_author_id_occurred_on_idx" ON "property_logs"("author_id", "occurred_on" DESC);

ALTER TABLE "property_logs" ADD CONSTRAINT "property_logs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_logs" ADD CONSTRAINT "property_logs_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_logs" ADD CONSTRAINT "property_logs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "property_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
