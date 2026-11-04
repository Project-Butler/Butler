-- 이메일 소유를 인증번호로 확인한 시각. 인증 도입 전 가입자는 null.
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "token_hash" TEXT,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_hash_key" ON "email_verifications"("token_hash");

-- CreateIndex
CREATE INDEX "email_verifications_email_created_at_idx" ON "email_verifications"("email", "created_at");

-- 새 테이블은 RLS를 켠다(README "DB 작업 규칙").
ALTER TABLE "email_verifications" ENABLE ROW LEVEL SECURITY;
