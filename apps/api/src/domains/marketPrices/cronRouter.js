// 시세 정기 실행 경로(app.js 에 app.use(marketPriceCronRouter) 한 줄). 인증은 A팀 cronGuard 를 가져다 쓴다(고치지 않는다).
// 일정(매일 02:00 한국 시간)은 marketPriceRules.SCHEDULE — 실제 등록은 apps/api/vercel.json(A팀 파일), 등록 요청 중.
import { Router } from 'express';
import { cronGuard } from '../../middlewares/cronGuard.js';
import { runMarketPriceCollection } from './controller.js';
import { SCHEDULE } from './marketPriceRules.js';

const router = Router();

router.get(SCHEDULE.path, cronGuard, runMarketPriceCollection);

export default router;
