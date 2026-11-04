import express, { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  getLatestOwnershipVerification,
  getOwnershipVerification,
  listRenewalTargets,
  postOwnershipVerification,
  postOwnershipVerificationResult,
} from './controller.js';

const RESULT_BODY_LIMIT = '64kb';

const router = Router();

// 남의 시도는 404로 숨긴다.
router.use(authGuard, roleGuard(['LANDLORD']), generalRateLimiter);

router.post('/', postOwnershipVerification);
router.get('/', getLatestOwnershipVerification);
router.get('/renewal-targets', listRenewalTargets);
router.get('/:attemptId', getOwnershipVerification);

export default router;

// 발급 서버 → API 결과 수신. 서명 검증에 원문 바이트가 필요해 express.json과 csrfGuard보다 앞에 둔다(app.js).
// 브라우저 호출이 아니고 서명이 CSRF 헤더를 대신한다.
export const ownershipVerificationResultRouter = Router();
ownershipVerificationResultRouter.post(
  '/:attemptId/result',
  express.raw({ type: () => true, limit: RESULT_BODY_LIMIT }),
  postOwnershipVerificationResult,
);
