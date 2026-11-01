// 관리자 운영 기능(/api/v1/admin, api-contract.md 8장 "관리자"). 전부 ADMIN만.
import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  getDashboard,
  getUser,
  listAuditLogs,
  listJobs,
  listOwnerships,
  listUsers,
  patchUserStatus,
  postJobRetry,
  postOwnershipEnd,
  postOwnershipRevoke,
  refreshJuso,
  refreshKapt,
} from './controller.js';

const router = Router();

router.use(authGuard, roleGuard(['ADMIN']), generalRateLimiter);

// juso 참고 데이터 즉시 갱신(매일 cron을 기다리지 않음)
router.post('/reference-data/juso/refresh', refreshJuso);
// K-apt 최신 기본정보 엑셀 즉시 갱신(주간 cron을 기다리지 않음)
router.post('/reference-data/kapt/refresh', refreshKapt);

router.get('/dashboard', getDashboard);
router.get('/users', listUsers);
router.get('/users/:userId', getUser);
router.patch('/users/:userId/status', patchUserStatus);
router.get('/property-ownerships', listOwnerships);
router.post('/property-ownerships/:ownershipId/revoke', postOwnershipRevoke);
router.post('/property-ownerships/:ownershipId/end', postOwnershipEnd);
router.get('/audit-logs', listAuditLogs);
router.get('/jobs', listJobs);
router.post('/jobs/:jobId/retry', postJobRetry);

export default router;
