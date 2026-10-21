-- 건물 설정 삭제를 숨김으로: 행은 남겨 예전 소유 호실이 임대인이 붙인 건물명을 계속 쓰게 한다.
-- AlterTable
ALTER TABLE "landlord_buildings" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);
