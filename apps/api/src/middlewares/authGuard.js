import jwt from 'jsonwebtoken';
import { AppError } from '../platform/AppError.js';

// access_token 만료는 다른 401과 코드를 구분한다 — 프론트 interceptor가
// AUTH_TOKEN_EXPIRED일 때만 자동으로 /auth/refresh를 부르고, 그 밖의 401은
// 바로 로그인 화면으로 보내기 때문이다(api-contract.md 1장 "인증(쿠키)").
export const authGuard = (req, res, next) => {
  const token = req.cookies?.access_token;

  if (!token) {
    return next(new AppError('UNAUTHENTICATED', 401, '로그인이 필요합니다.'));
  }

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = { id: payload.userId, role: payload.role };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('AUTH_TOKEN_EXPIRED', 401, '로그인이 만료되었습니다.'));
    }
    return next(new AppError('UNAUTHENTICATED', 401, '유효하지 않은 토큰입니다.'));
  }
};
