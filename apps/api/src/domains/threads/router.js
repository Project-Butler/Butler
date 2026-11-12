import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getThread, listMessages, listThreads, postMessage, postThread, postThreadRead } from './controller.js';

const router = Router();

// api-contract.md 6장 "소통". 임대인·임차인 2자 대화. 운영자는 열람만 한다(숨김은 8장 운영 API).
// 참여하지 않은 스레드는 404로 숨긴다.
router.use(authGuard);

const PARTICIPANTS = ['LANDLORD', 'TENANT'];
const VIEWERS = ['LANDLORD', 'TENANT', 'ADMIN'];

router.post('/', roleGuard(PARTICIPANTS), generalRateLimiter, postThread);
router.get('/', roleGuard(PARTICIPANTS), generalRateLimiter, listThreads);
router.get('/:threadId', roleGuard(VIEWERS), generalRateLimiter, getThread);
router.get('/:threadId/messages', roleGuard(VIEWERS), generalRateLimiter, listMessages);
router.post('/:threadId/messages', roleGuard(PARTICIPANTS), generalRateLimiter, postMessage);
router.post('/:threadId/read', roleGuard(PARTICIPANTS), generalRateLimiter, postThreadRead);

export default router;
