-- CreateEnum
CREATE TYPE "community_post_category" AS ENUM ('FREE', 'MARKET', 'MAINTENANCE', 'POLICY');

-- CreateEnum
CREATE TYPE "community_report_reason" AS ENUM ('SPAM', 'ABUSE', 'ADVERTISEMENT', 'PRIVACY', 'OTHER');

-- CreateEnum
CREATE TYPE "community_report_status" AS ENUM ('RECEIVED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "community_poll_scope" AS ENUM ('COMPLEX', 'REGION');

-- CreateEnum
CREATE TYPE "community_news_source" AS ENUM ('NEWS_SEARCH', 'MOLIT_PRESS');

-- CreateEnum
CREATE TYPE "community_news_scope" AS ENUM ('NATIONWIDE', 'SIGUNGU');

-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "legal_dong_code" VARCHAR(10) NOT NULL,
    "category" "community_post_category" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "author_label" TEXT NOT NULL,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "author_id" UUID NOT NULL,
    "author_label" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reports" (
    "id" UUID NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "reporter_id" UUID NOT NULL,
    "reason" "community_report_reason" NOT NULL,
    "detail" VARCHAR(500),
    "status" "community_report_status" NOT NULL DEFAULT 'RECEIVED',
    "handled_at" TIMESTAMPTZ(3),
    "handled_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_polls" (
    "id" UUID NOT NULL,
    "scope" "community_poll_scope" NOT NULL,
    "legal_dong_code" VARCHAR(10) NOT NULL,
    "complex_id" UUID,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "author_id" UUID NOT NULL,
    "author_label" TEXT NOT NULL,
    "closes_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_poll_options" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "vote_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "community_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_poll_votes" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_news_items" (
    "id" UUID NOT NULL,
    "source" "community_news_source" NOT NULL,
    "scope" "community_news_scope" NOT NULL,
    "scope_code" VARCHAR(5),
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "url_hash" VARCHAR(64) NOT NULL,
    "publisher" TEXT,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "collected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_posts_legal_dong_code_category_created_at_idx" ON "community_posts"("legal_dong_code", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "community_posts_legal_dong_code_author_id_created_at_idx" ON "community_posts"("legal_dong_code", "author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "community_comments_post_id_created_at_idx" ON "community_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "community_comments_author_id_idx" ON "community_comments"("author_id");

-- CreateIndex
CREATE INDEX "community_reports_status_created_at_idx" ON "community_reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "community_reports_post_id_reporter_id_key" ON "community_reports"("post_id", "reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_reports_comment_id_reporter_id_key" ON "community_reports"("comment_id", "reporter_id");

-- CreateIndex
CREATE INDEX "community_polls_legal_dong_code_closed_at_closes_at_idx" ON "community_polls"("legal_dong_code", "closed_at", "closes_at");

-- CreateIndex
CREATE INDEX "community_polls_complex_id_closes_at_idx" ON "community_polls"("complex_id", "closes_at");

-- CreateIndex
CREATE INDEX "community_polls_closed_at_closes_at_idx" ON "community_polls"("closed_at", "closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "community_poll_options_id_poll_id_key" ON "community_poll_options"("id", "poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_poll_options_poll_id_position_key" ON "community_poll_options"("poll_id", "position");

-- CreateIndex
CREATE INDEX "community_poll_votes_option_id_idx" ON "community_poll_votes"("option_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_poll_votes_poll_id_voter_id_key" ON "community_poll_votes"("poll_id", "voter_id");

-- CreateIndex
CREATE INDEX "community_news_items_scope_scope_code_published_at_idx" ON "community_news_items"("scope", "scope_code", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "community_news_items_scope_code_url_hash_key" ON "community_news_items"("scope_code", "url_hash");

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_poll_options" ADD CONSTRAINT "community_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "community_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_poll_votes" ADD CONSTRAINT "community_poll_votes_option_id_poll_id_fkey" FOREIGN KEY ("option_id", "poll_id") REFERENCES "community_poll_options"("id", "poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== 아래는 손으로 추가한 것 (Prisma 스키마로 표현할 수 없음) =====

-- 1) RLS. README "데이터베이스" 절: 새 테이블을 만드는 마이그레이션에는 직접 추가한다.
--    일곱 테이블 전부 빠뜨리지 말 것.
ALTER TABLE "community_posts"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_comments"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_reports"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_polls"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_poll_options"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_poll_votes"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_news_items"    ENABLE ROW LEVEL SECURITY;

-- 2) 전국 기사 중복 방지. scopeCode 가 NULL 인 행끼리의 유니크.
CREATE UNIQUE INDEX "uq_community_news_nationwide_url"
  ON "community_news_items" ("url_hash")
  WHERE "scope_code" IS NULL;

-- 3) 투표 범위와 단지의 짝. COMPLEX 면 단지가 있어야 하고, REGION 이면 없어야 한다.
--    이게 없으면 "범위는 우리 단지인데 어느 단지인지 모르는" 투표가 들어가고,
--    참여 자격 판정이 그 지점에서 터진다.
ALTER TABLE "community_polls" ADD CONSTRAINT "chk_community_poll_scope"
  CHECK (
    (scope = 'COMPLEX' AND complex_id IS NOT NULL) OR
    (scope = 'REGION'  AND complex_id IS NULL)
  );

-- 4) 신고 대상은 글이나 댓글 중 정확히 하나.
ALTER TABLE "community_reports" ADD CONSTRAINT "chk_community_report_target"
  CHECK (num_nonnulls(post_id, comment_id) = 1);
