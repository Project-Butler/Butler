import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { listSchedules } from './controller.js';

const router = Router();

// api-contract.md 7장 "일정". 로그인한 사용자 본인 것만. USER 일정 POST·PATCH·DELETE는 아직 없다(#161).
router.use(authGuard, roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter);

router.get('/', listSchedules);

export default router;
