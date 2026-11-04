import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import {
  emailVerificationConfirmRateLimiter,
  emailVerificationRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
} from '../../middlewares/rateLimiter.js';
import { completeOAuthSignup, getOAuthSignup, oauthCallback, startOAuth } from './oauth/oauthController.js';
import { login, logout, me, refresh, register } from './controller.js';
import { confirmEmailVerificationCode, requestEmailVerification } from './emailVerificationController.js';

const router = Router();

router.post('/email-verifications', emailVerificationRateLimiter, requestEmailVerification);
router.post('/email-verifications/confirm', emailVerificationConfirmRateLimiter, confirmEmailVerificationCode);
router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
// 소셜 로그인(구글·카카오). 정적 경로(/oauth/signup)가 :provider보다 먼저 와야 한다.
router.get('/oauth/signup', getOAuthSignup);
router.post('/oauth/signup', registerRateLimiter, completeOAuthSignup);
router.get('/oauth/:provider', startOAuth);
router.get('/oauth/:provider/callback', oauthCallback);
router.get('/me', authGuard, me);

export default router;
