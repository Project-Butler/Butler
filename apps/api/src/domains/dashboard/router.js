import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getLandlordSetup } from './controller.js';

const router = Router();

// 임대인 초기 세팅 진행 현황(명세 변경 C11)
router.use(authGuard);

router.get('/landlord/setup', roleGuard(['LANDLORD']), generalRateLimiter, getLandlordSetup);

export default router;
