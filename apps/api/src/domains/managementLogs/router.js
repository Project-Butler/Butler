import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getManagementLog, listManagementLogs, patchManagementLog, removeManagementLog } from './controller.js';

const router = Router();

// api-contract.md 5장 "관리 로그". 호실 아래 경로(작성·호실별 목록)는 properties 라우터에 있다.
// 볼 수 없는 기록은 404로 숨긴다.
router.use(authGuard);

router.get('/', roleGuard(['LANDLORD']), generalRateLimiter, listManagementLogs);
router.get('/:logId', roleGuard(['LANDLORD', 'ADMIN']), generalRateLimiter, getManagementLog);
router.patch('/:logId', roleGuard(['LANDLORD']), generalRateLimiter, patchManagementLog);
router.delete('/:logId', roleGuard(['LANDLORD']), generalRateLimiter, removeManagementLog);

export default router;
