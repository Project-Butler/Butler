// 권리자 인증 정기 실행 경로(app.js 에 app.use(ownershipVerificationCronRouter) 한 줄). 인증은 A팀 cronGuard 를 가져다 쓴다(고치지 않는다).
// 권리자 인증 API 라우터는 /api/v1/ownership-verifications 에 붙어 있어서, 커뮤니티 · 시세처럼 경로를 품은 라우터를 따로 둔다.
// 일정은 identityVerification.js 의 PURGE_SCHEDULE — 실제 등록은 apps/api/vercel.json(A팀 파일)의 crons.
//   /api/cron/ownership-identity-verifications  보관 기간(하루)이 지난 본인인증 사용 기록 삭제, 매일 01:00 KST
import { Router } from 'express';
import { cronGuard } from '../../middlewares/cronGuard.js';
import { runIdentityVerificationUsePurge } from './controller.js';
import { PURGE_SCHEDULE } from './identityVerification.js';

const router = Router();

router.get(PURGE_SCHEDULE.path, cronGuard, runIdentityVerificationUsePurge);

export default router;
