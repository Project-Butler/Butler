// 관리자 운영 기능(/api/v1/admin, api-contract.md 8장 "관리자"). 전부 ADMIN만.
import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { refreshJuso } from './controller.js';

const router = Router();

router.use(authGuard, roleGuard(['ADMIN']), generalRateLimiter);

// juso 참고 데이터 즉시 갱신(매일 cron을 기다리지 않음)
router.post('/reference-data/juso/refresh', refreshJuso);

export default router;
