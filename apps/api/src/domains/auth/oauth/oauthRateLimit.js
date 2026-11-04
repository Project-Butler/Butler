import { oauthRateLimiter } from '../../../middlewares/rateLimiter.js';
import { frontendUrl } from './oauthController.js';

// 시작·콜백은 브라우저가 주소로 직접 이동해 오는 요청이라, 한도를 넘어도 JSON 429 대신 로그인 화면으로 돌려보낸다.
export const oauthNavigationRateLimit = (req, res, next) =>
  oauthRateLimiter(req, res, (error) => {
    if (error?.code !== 'RATE_LIMITED') return next(error);
    let base;
    try {
      base = frontendUrl();
    } catch (configError) {
      return next(configError);
    }
    console.warn('[oauth] 요청 한도 초과', req.ip);
    return res.redirect(`${base}/login?oauth_error=RATE_LIMITED`);
  });
