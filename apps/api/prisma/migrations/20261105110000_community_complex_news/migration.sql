-- 3차 ② 단지 뉴스(우리 단지, 11/05). 새 범위 COMPLEX — scope_code 에 complexId(uuid 36자)를 담으려고 칸을 넓힌다.
-- 수집 순번 표: 범위마다 마지막 수집 시도 시각(오래 안 모은 단지부터).

-- AlterEnum
ALTER TYPE "community_news_scope" ADD VALUE 'COMPLEX';

-- AlterTable
ALTER TABLE "community_news_items" ALTER COLUMN "scope_code" SET DATA TYPE VARCHAR(36);

-- CreateTable
CREATE TABLE "community_news_cursors" (
    "scope" "community_news_scope" NOT NULL,
    "scope_code" VARCHAR(36) NOT NULL,
    "last_collected_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_news_cursors_pkey" PRIMARY KEY ("scope","scope_code")
);

-- CreateIndex
CREATE INDEX "community_news_cursors_scope_last_collected_at_idx" ON "community_news_cursors"("scope", "last_collected_at");

-- 직접 추가: 새 표 RLS(다른 community_* 표와 같게)
ALTER TABLE "community_news_cursors" ENABLE ROW LEVEL SECURITY;
