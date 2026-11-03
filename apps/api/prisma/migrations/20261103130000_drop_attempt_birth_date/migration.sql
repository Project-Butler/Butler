-- 권리자 인증은 회원 정보(users.birth_date)의 생년월일로 비교한다. 시도 행의 임시 생년월일 칸은 쓰지 않는다.
ALTER TABLE "ownership_verification_attempts" DROP COLUMN "birth_date_enc";
