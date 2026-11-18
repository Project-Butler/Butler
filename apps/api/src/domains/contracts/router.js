import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  getContract,
  listContracts,
  listRenewalNotices,
  patchContract,
  postContract,
  postContractTermination,
  postRenewalNotice,
  removeRenewalNotice,
} from './controller.js';

const router = Router();

// api-contract.md 4장 "계약". 쓰기는 임대인만, 목록은 임대인·임차인, 상세는 운영자도 본다.
// 볼 수 없는 계약은 404로 숨긴다.
router.use(authGuard);

router.post('/', roleGuard(['LANDLORD']), generalRateLimiter, postContract);
router.get('/', roleGuard(['LANDLORD', 'TENANT']), generalRateLimiter, listContracts);
router.get('/:contractId', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter, getContract);
router.patch('/:contractId', roleGuard(['LANDLORD']), generalRateLimiter, patchContract);
router.post('/:contractId/terminate', roleGuard(['LANDLORD']), generalRateLimiter, postContractTermination);

// 갱신 거절 통지 기록(묵시적 갱신 차단, #157). 임대인 개인 기록이라 소유자만 본다(임차인도 404).
router.get('/:contractId/renewal-notices', roleGuard(['LANDLORD']), generalRateLimiter, listRenewalNotices);
router.post('/:contractId/renewal-notices', roleGuard(['LANDLORD']), generalRateLimiter, postRenewalNotice);
router.delete('/:contractId/renewal-notices/:noticeId', roleGuard(['LANDLORD']), generalRateLimiter, removeRenewalNotice);

export default router;
