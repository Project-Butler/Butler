import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getContract, listContracts, patchContract, postContract, postContractTermination } from './controller.js';

const router = Router();

// api-contract.md 4장 "계약". 쓰기는 임대인만, 목록은 임대인·임차인, 상세는 운영자도 본다.
// 볼 수 없는 계약은 404로 숨긴다.
router.use(authGuard);

router.post('/', roleGuard(['LANDLORD']), generalRateLimiter, postContract);
router.get('/', roleGuard(['LANDLORD', 'TENANT']), generalRateLimiter, listContracts);
router.get('/:contractId', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter, getContract);
router.patch('/:contractId', roleGuard(['LANDLORD']), generalRateLimiter, patchContract);
router.post('/:contractId/terminate', roleGuard(['LANDLORD']), generalRateLimiter, postContractTermination);

export default router;
