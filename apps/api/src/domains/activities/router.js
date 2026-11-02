import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { listActivities } from './controller.js';

const router = Router();

// 최근 활동(명세 변경 C11). 본인 것만, 최신순.
router.use(authGuard);

router.get('/', roleGuard(['LANDLORD']), generalRateLimiter, listActivities);

export default router;
