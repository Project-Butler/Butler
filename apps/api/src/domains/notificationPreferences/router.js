import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getPreference, patchPreference } from './controller.js';

const router = Router();

// api-contract.md 7장 "알림" notification-preferences. 로그인한 사용자 본인 것만(세 역할 모두).
router.use(authGuard, roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter);

router.get('/', getPreference);
router.patch('/', patchPreference);

export default router;
