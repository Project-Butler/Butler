-- CreateTable
CREATE TABLE "identity_verification_uses" (
    "identity_verification_id" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verification_uses_pkey" PRIMARY KEY ("identity_verification_id")
);

-- 새 표는 RLS 를 켠다(Prisma 가 넣어 주지 않는다 — README DB 규칙)
ALTER TABLE "identity_verification_uses" ENABLE ROW LEVEL SECURITY;
