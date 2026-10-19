import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { complexSearchRateLimiter, generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getComplex, getComplexUnitInfo, resolveComplexBySourceKey, searchComplexList } from './controller.js';

const router = Router();

router.use(authGuard);

// 검색은 외부 공공데이터 쿼터를 쓰므로 일반 한도보다 좁은 전용 한도를 건다.
router.get('/search', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), complexSearchRateLimiter, searchComplexList);
router.post('/resolve', roleGuard(['LANDLORD', 'ADMIN']), generalRateLimiter, resolveComplexBySourceKey);
router.get('/:complexId', generalRateLimiter, getComplex);
router.get('/:complexId/unit-info', roleGuard(['LANDLORD', 'ADMIN']), complexSearchRateLimiter, getComplexUnitInfo);

export default router;
