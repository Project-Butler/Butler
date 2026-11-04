import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import {
  emailVerificationConfirmRateLimiter,
  emailVerificationRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
} from '../../middlewares/rateLimiter.js';
import { login, logout, me, refresh, register } from './controller.js';
import { confirmEmailVerificationCode, requestEmailVerification } from './emailVerificationController.js';

const router = Router();

router.post('/email-verifications', emailVerificationRateLimiter, requestEmailVerification);
router.post('/email-verifications/confirm', emailVerificationConfirmRateLimiter, confirmEmailVerificationCode);
router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authGuard, me);

export default router;
