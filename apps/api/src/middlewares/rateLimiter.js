// 요청 한도(rate limit) 미들웨어. 서버리스 환경이라 카운터를 메모리가 아니라
// DB(RateLimit)에 둔다(노션 4번 인증 방식 4장). 고정 윈도우(fixed
// window) 방식 — 윈도우 안에서 요청이 max를 넘으면 429 RATE_LIMITED.
//
// 아래 네 개 인스턴스는 아직 라우터에 연결하지 않았다. 해당 라우터가 v1.0 모양으로
// 마이그레이션될 때(7번) authGuard 등과 함께 붙인다.
import { AppError } from '../platform/AppError.js';
import { prisma } from '../platform/prismaClient.js';

export const rateLimiter =
  ({ windowMs, max, keyFn, message }) =>
  async (req, res, next) => {
    const id = keyFn(req);
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs);

    let count;
    try {
      count = await prisma.$transaction(async (tx) => {
        const existing = await tx.rateLimit.findUnique({ where: { id } });

        if (!existing || existing.windowStart.getTime() !== windowStart.getTime()) {
          const reset = await tx.rateLimit.upsert({
            where: { id },
            create: { id, count: 1, windowStart, expiresAt },
            update: { count: 1, windowStart, expiresAt },
          });
          return reset.count;
        }

        const incremented = await tx.rateLimit.update({
          where: { id },
          data: { count: { increment: 1 } },
        });
        return incremented.count;
      });
    } catch (error) {
      // 카운터 저장소(DB) 자체가 응답하지 않을 때는 요청을 막지 않고 통과시킨다
      // (fail open). 저장소 장애로 로그인 전체가 막히는 것보다, 잠깐 한도 체크를
      // 못 하고 통과시키는 쪽이 안전하다.
      console.error(`[rateLimiter] 카운터 저장 실패, 요청을 통과시킴 (id=${id}):`, error.message);
      return next();
    }

    if (count > max) {
      return next(new AppError('RATE_LIMITED', 429, message ?? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'));
    }

    return next();
  };

// 노션 4번 인증 방식 4장 "요청 한도"
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

// 단지 검색은 요청마다 외부 공공데이터(juso·K-apt)를 부르므로 사용자당 1분에 20회로 좁힌다.
// authGuard 이후에 건다.
export const complexSearchRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyFn: (req) => `complex-search:${req.user.id}`,
  message: '단지 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
});
