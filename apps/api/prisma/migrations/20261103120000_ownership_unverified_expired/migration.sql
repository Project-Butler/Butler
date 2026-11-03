-- 기간 안에 권리자 인증을 하지 않아 자동으로 끝난 소유 관계
ALTER TYPE "end_reason" ADD VALUE 'UNVERIFIED_EXPIRED';
