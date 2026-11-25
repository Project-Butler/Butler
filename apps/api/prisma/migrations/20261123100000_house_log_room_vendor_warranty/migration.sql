-- 하우스 로그 개편(docs 15): 방(위치) 태그와 수리 완료 정보(업체·보증). 모두 null 가능, 기존 행은 null.
-- AlterTable
ALTER TABLE "property_logs" ADD COLUMN "room" VARCHAR(20),
ADD COLUMN "vendor_name" VARCHAR(100),
ADD COLUMN "warranty_until" DATE;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "room" VARCHAR(20);
