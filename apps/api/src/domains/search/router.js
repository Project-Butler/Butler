import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { search } from './controller.js';

const router = Router();

// api-contract.md 7장 "검색" v1.1. 임대인·임차인만, 본인이 볼 수 있는 것만.
router.use(authGuard, roleGuard(['LANDLORD', 'TENANT']), generalRateLimiter);

router.get('/', search);

export default router;
