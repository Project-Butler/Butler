import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { loginRateLimiter, registerRateLimiter } from '../../middlewares/rateLimiter.js';
import { login, logout, me, refresh, register } from './controller.js';

const router = Router();

router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authGuard, me);

export default router;
