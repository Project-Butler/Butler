-- 월세 입금일(매월 며칠, 1~31, 31은 말일). 월세 계약만 쓰고 전세·기존 계약은 null(#76).
ALTER TABLE "contracts" ADD COLUMN "rent_payment_day" INTEGER;
