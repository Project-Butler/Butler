-- 하우스 로그 개편 새 2단계 P-4a1(docs 15 2단계 계획): 나만 보기 뜻 저장, 처음 인증 시각, 인증 전 기록 올리기 처리 시각.

-- AlterTable
ALTER TABLE "property_logs" ADD COLUMN "keep_private" BOOLEAN NOT NULL DEFAULT false;

-- 지금까지 사용자가 고른 나만 보기는 올리기 대상에서 뺀다.
UPDATE "property_logs" SET "keep_private" = true WHERE "scope" = 'PRIVATE';

-- AlterTable
ALTER TABLE "ownerships" ADD COLUMN "first_verified_at" TIMESTAMPTZ(3),
ADD COLUMN "logs_promoted_at" TIMESTAMPTZ(3);

-- 이미 인증한 소유 관계: 처음 인증 시각은 지금 인증 시각으로, 올리기는 처리한 것으로 본다(H-44는 처음 인증 전 기록만).
-- 인증 시각이 비어 있어도 상태가 VERIFIED(만료 포함)·REVOKED면 인증한 적 있는 관계다. 소유 시작 시각으로 채워
-- 끝날 때 기록이 지워지지 않게 한다(H-37).
UPDATE "ownerships" SET "first_verified_at" = COALESCE("verified_at", "started_at")
  WHERE ("verified_at" IS NOT NULL OR "verification_status" IN ('VERIFIED', 'REVOKED'));
UPDATE "ownerships" SET "logs_promoted_at" = now()
  WHERE ("verified_at" IS NOT NULL OR "verification_status" IN ('VERIFIED', 'REVOKED'));
