// Vercel Cron이 부르는 주기 작업. api-contract의 /api/v1 경로가 아니라 /api/cron 아래에 둔다
// (프론트가 부르는 API가 아님). 스케줄은 apps/api/vercel.json의 crons.
import { Router } from 'express';
import { cronGuard } from '../../middlewares/cronGuard.js';
import { runKaptComplexSync } from './controller.js';

const router = Router();

router.get('/api/cron/kapt-complexes', cronGuard, runKaptComplexSync);

export default router;
