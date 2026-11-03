-- 소유주 인증(이름+생년월일)에 쓰는 생년월일. 애플리케이션에서 암호화한 값을 저장하고, 기존 사용자는 null.
ALTER TABLE "users" ADD COLUMN "birth_date" TEXT;
