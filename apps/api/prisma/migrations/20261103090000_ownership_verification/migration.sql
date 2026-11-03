-- 소유 종료 사유 SOLD. 같은 마이그레이션에서 이 값을 쓰지 않는다.
ALTER TYPE "end_reason" ADD VALUE 'SOLD';

CREATE TYPE "verification_attempt_status" AS ENUM ('PENDING', 'RUNNING', 'VERIFIED', 'FAILED');

CREATE TABLE "platform_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ownership_verification_attempts" (
    "id" UUID NOT NULL,
    "ownership_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "verification_attempt_status" NOT NULL DEFAULT 'PENDING',
    "reason_code" VARCHAR(40),
    "ledger_kind" VARCHAR(20),
    "owner_count" INTEGER,
    "birth_date_enc" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "ownership_verification_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ownership_verification_attempts_ownership_id_created_at_idx" ON "ownership_verification_attempts"("ownership_id", "created_at" DESC);
CREATE INDEX "ownership_verification_attempts_created_at_idx" ON "ownership_verification_attempts"("created_at" DESC);

ALTER TABLE "ownership_verification_attempts" ADD CONSTRAINT "ownership_verification_attempts_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ownership_verification_attempts" ADD CONSTRAINT "ownership_verification_attempts_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 이중 제출 방지: 진행 중 시도는 소유 관계마다 1건. Prisma로 표현되지 않는다.
CREATE UNIQUE INDEX "uq_verification_attempt_active" ON "ownership_verification_attempts" ("ownership_id")
  WHERE "status" IN ('PENDING', 'RUNNING');
-- 멈춘 시도 정리용
CREATE INDEX "ix_verification_attempt_active_created" ON "ownership_verification_attempts" ("created_at")
  WHERE "status" IN ('PENDING', 'RUNNING');

-- 다른 테이블과 같이 Data API에서 읽지 못하게 한다(20261019151509_enable_rls_revoke_data_api).
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ownership_verification_attempts" ENABLE ROW LEVEL SECURITY;
