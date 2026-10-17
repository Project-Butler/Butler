import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getReference, listReferences } from './controller.js';

const router = Router();

// 분쟁 참고자료(조정사례·판례·가이드라인)는 로그인한 모든 역할이 읽을 수 있다.
router.use(authGuard, roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter);

router.get('/references', listReferences);
router.get('/references/:referenceId', getReference);

export default router;
