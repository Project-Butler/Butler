import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getPromotePreview, postPromote } from '../managementLogs/controller.js';
import { getOwnership, listOwnerships, patchOwnership, postOwnershipEnd, postOwnershipRemove } from './controller.js';

const router = Router();

// api-contract.md 3장 "소유 관계". 본인 것만 다루고, 남의 소유 관계는 404로 숨긴다.
router.use(authGuard);

router.get('/', roleGuard(['LANDLORD']), generalRateLimiter, listOwnerships);
router.get('/:ownershipId', roleGuard(['LANDLORD', 'ADMIN']), generalRateLimiter, getOwnership);
router.patch('/:ownershipId', roleGuard(['LANDLORD']), generalRateLimiter, patchOwnership);
router.post('/:ownershipId/end', roleGuard(['LANDLORD']), generalRateLimiter, postOwnershipEnd);
// 끝난 소유 관계를 목록에서 지우기(하우스 로그 H-41).
router.post('/:ownershipId/remove', roleGuard(['LANDLORD']), generalRateLimiter, postOwnershipRemove);
// 인증 뒤 올리기(하우스 로그 H-44, 계약 5장). 처리는 managementLogs.
router.get('/:ownershipId/management-logs/promote-preview', roleGuard(['LANDLORD']), generalRateLimiter, getPromotePreview);
router.post('/:ownershipId/management-logs/promote', roleGuard(['LANDLORD']), generalRateLimiter, postPromote);

export default router;
