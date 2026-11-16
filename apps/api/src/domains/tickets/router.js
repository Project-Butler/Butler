import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { getTicket, listTickets, patchTicket, postTicket } from './controller.js';

const router = Router();

// api-contract.md 5장 "티켓(수리·점검 요청)". 볼 수 없는 티켓은 404로 숨긴다.
// 만들기·바꾸기는 임대인·임차인, 조회는 운영자도 한다.
router.use(authGuard);

router.post('/', roleGuard(['LANDLORD', 'TENANT']), generalRateLimiter, postTicket);
router.get('/', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter, listTickets);
router.get('/:ticketId', roleGuard(['LANDLORD', 'TENANT', 'ADMIN']), generalRateLimiter, getTicket);
router.patch('/:ticketId', roleGuard(['LANDLORD', 'TENANT']), generalRateLimiter, patchTicket);

export default router;
