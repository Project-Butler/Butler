import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { getUnreadCount, listNotifications, postRead, postReadAll } from './controller.js';

const router = Router();

// api-contract.md 7장 "알림". 로그인한 사용자 본인 것만.
router.use(authGuard, generalRateLimiter);

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/read-all', postReadAll);
router.post('/:notificationId/read', postRead);

export default router;
