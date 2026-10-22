// Vercel Cron이 부르는 주기 작업. api-contract의 /api/v1 경로가 아니라 /api/cron 아래에 둔다
// (프론트가 부르는 API가 아님). 스케줄은 apps/api/vercel.json의 crons.
//   주간 /api/cron/kapt-complexes: K-apt 단지 목록 동기화 + 외부 API 상태 점검
//   매일 /api/cron/reference-data: juso 변동분 적용 + 새 K-apt 단지 기본정보 + 단지 kaptCode·검색 저장본 정리
import { Router } from 'express';
import { cronGuard } from '../../middlewares/cronGuard.js';
import { runKaptComplexSync, runReferenceData } from './controller.js';

const router = Router();

router.get('/api/cron/kapt-complexes', cronGuard, runKaptComplexSync);
router.get('/api/cron/reference-data', cronGuard, runReferenceData);

export default router;
