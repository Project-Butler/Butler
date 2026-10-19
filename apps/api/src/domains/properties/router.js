import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { createProperty, getProperty, listProperties, patchProperty } from './controller.js';

const router = Router();

// api-contract.md 3장 "호실". 조회는 로그인한 모든 역할이 할 수 있고, 관계가 없으면 404로 숨긴다.
router.use(authGuard);

router.post('/', roleGuard(['LANDLORD']), generalRateLimiter, createProperty);
router.get('/', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter, listProperties);
router.get('/:propertyId', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter, getProperty);
router.patch('/:propertyId', roleGuard(['LANDLORD', 'ADMIN']), generalRateLimiter, patchProperty);

export default router;
