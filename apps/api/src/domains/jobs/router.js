import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getJob } from './controller.js';

const router = Router();

// api-contract.md 8장 "작업(Job)". 요청한 사용자 본인과 ADMIN만 본다.
router.use(authGuard, roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter);

router.get('/:jobId', getJob);

export default router;
