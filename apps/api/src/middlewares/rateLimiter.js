// 요청 한도(rate limit) 미들웨어. 서버리스 환경이라 카운터를 메모리가 아니라
// DB(RateLimitCounter)에 둔다(api-contract.md 1장 "요청 한도"). 고정 윈도우(fixed
// window) 방식 — 윈도우 안에서 요청이 max를 넘으면 429 RATE_LIMITED.
//
// 아래 네 개 인스턴스는 아직 라우터에 연결하지 않았다. 해당 라우터가 v1.0 모양으로
// 마이그레이션될 때(7번) authGuard 등과 함께 붙인다.
import { AppError } from '../platform/AppError.js';
import { prisma } from '../platform/prismaClient.js';

export const rateLimiter =
  ({ windowMs, max, keyFn, message }) =>
  async (req, res, next) => {
    const key = keyFn(req);
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    let count;
    try {
      count = await prisma.$transaction(async (tx) => {
        const existing = await tx.rateLimitCounter.findUnique({ where: { key } });

        if (!existing || existing.windowStart.getTime() !== windowStart.getTime()) {
          const reset = await tx.rateLimitCounter.upsert({
            where: { key },
            create: { key, count: 1, windowStart },
            update: { count: 1, windowStart },
          });
          return reset.count;
        }

        const incremented = await tx.rateLimitCounter.update({
          where: { key },
          data: { count: { increment: 1 } },
        });
        return incremented.count;
      });
    } catch (error) {
      // 카운터 저장소(DB) 자체가 응답하지 않을 때는 요청을 막지 않고 통과시킨다
      // (fail open). 저장소 장애로 로그인 전체가 막히는 것보다, 잠깐 한도 체크를
      // 못 하고 통과시키는 쪽이 안전하다.
      console.error(`[rateLimiter] 카운터 저장 실패, 요청을 통과시킴 (key=${key}):`, error.message);
      return next();
    }

    if (count > max) {
      return next(new AppError('RATE_LIMITED', 429, message ?? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'));
    }

    return next();
  };

// api-contract.md 1장 "요청 한도(기본값)"
export const loginRateLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyFn: (req) => `login:${req.body?.email ?? 'unknown'}:${req.ip}`,
  message: '로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.',
});

export const registerRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyFn: (req) => `register:${req.ip}`,
  message: '회원가입 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.',
});

export const passwordResetRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyFn: (req) => `password-reset:${req.body?.email ?? 'unknown'}`,
  message: '비밀번호 재설정 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.',
});

// 로그인한 사용자 기준 일반 한도 — authGuard 이후(req.user가 있는 라우터)에 건다.
export const generalRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyFn: (req) => `general:${req.user?.id ?? req.ip}`,
  message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
});
