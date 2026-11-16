-- 커뮤니티 닉네임(3차 ③, 계획서 12-3). 규칙은 domains/community/nicknameRules.js
-- CreateTable
CREATE TABLE "community_profiles" (
    "user_id" UUID NOT NULL,
    "nickname" VARCHAR(12) NOT NULL,
    "nickname_key" VARCHAR(12) NOT NULL,
    "nickname_changed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_profiles_nickname_key_key" ON "community_profiles"("nickname_key");

-- 새 표는 RLS 를 켠다(Prisma 가 넣어 주지 않는다 — README DB 규칙)
ALTER TABLE "community_profiles" ENABLE ROW LEVEL SECURITY;
