// 시세 API — /api/v1/market-prices (app.js 에 한 줄). 시세 계획서 1절: 규격의 /complexes/… 는 플랫폼(A팀) 경로라 피처 경로를 따로 쓴다.
// 권한은 로그인(규격 그대로). 응답은 연동 규격 2장 "시세" 와 같은 모양.
import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { getComplexMarketPrices, getRegionMarketPrices } from './controller.js';

const router = Router();

router.use(authGuard, generalRateLimiter);
router.get('/complexes/:complexId', getComplexMarketPrices);
router.get('/regions/:legalDongCode', getRegionMarketPrices);

export default router;
