// Vercel Cron 전용 인증. Vercel은 cron 요청에 `Authorization: Bearer <CRON_SECRET>` 헤더를 붙인다.
// CRON_SECRET이 없는 환경에서는 라우트가 없는 것처럼 404로 숨긴다(next('router')로 라우터를 빠져나감).
// 비교는 길이 차이까지 숨기도록 SHA-256으로 맞춘 뒤 timingSafeEqual로 한다. 헤더·시크릿 값은 로그에 남기지 않는다.
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../platform/AppError.js';

const toDigest = (value) => createHash('sha256').update(value).digest();

export const cronGuard = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return next('router');

  const authorization = req.get('Authorization') ?? '';
  if (!timingSafeEqual(toDigest(authorization), toDigest(`Bearer ${secret}`))) {
    return next(new AppError('UNAUTHENTICATED', 401, '인증이 필요합니다.'));
  }
  return next();
};
