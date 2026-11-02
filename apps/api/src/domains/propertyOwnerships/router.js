import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getOwnership, listOwnerships, patchOwnership, postOwnershipEnd } from './controller.js';

const router = Router();

// api-contract.md 3장 "소유 관계". 본인 것만 다루고, 남의 소유 관계는 404로 숨긴다.
router.use(authGuard);

router.get('/', roleGuard(['LANDLORD']), generalRateLimiter, listOwnerships);
router.get('/:ownershipId', roleGuard(['LANDLORD', 'ADMIN']), generalRateLimiter, getOwnership);
router.patch('/:ownershipId', roleGuard(['LANDLORD']), generalRateLimiter, patchOwnership);
router.post('/:ownershipId/end', roleGuard(['LANDLORD']), generalRateLimiter, postOwnershipEnd);

export default router;
