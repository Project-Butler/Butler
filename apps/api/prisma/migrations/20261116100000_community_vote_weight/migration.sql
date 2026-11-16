-- 3차 ① 투표권 = 범위 안 인증 호실 수(11/05 이사님 결정 "보유 수로").
-- 참여 순간의 표 수를 투표 행에 굳히고(weight, 기본 1), 투표 · 선택지에 표 수 합(weight_total)을 둔다. 참여 인원(vote_count)은 그대로.

-- AlterTable
ALTER TABLE "community_polls" ADD COLUMN     "weight_total" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "community_poll_options" ADD COLUMN     "weight_total" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "community_poll_votes" ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 1;

-- 직접 추가: 표 수는 1 이상(Prisma 가 CHECK 를 만들지 않는다)
ALTER TABLE "community_poll_votes" ADD CONSTRAINT "community_poll_votes_weight_check" CHECK ("weight" >= 1);

-- 직접 추가: 기존 데이터 — 투표 행은 weight 1(위 DEFAULT), 표 수 합 = 참여 인원
UPDATE "community_poll_options" SET "weight_total" = "vote_count";
UPDATE "community_polls" SET "weight_total" = "vote_count";
