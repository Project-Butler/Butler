// 커뮤니티 정기 작업(Vercel Cron). 커뮤니티 API 라우터는 /api/v1/community 에 붙어 있어서 그 안에 두면
// /api/v1/community/api/cron/... 이 되므로, A팀 domains/cron/router.js 처럼 경로를 품은 라우터를 따로 둔다
// (app.js 에 app.use(communityCronRouter) 한 줄). 인증은 A팀 cronGuard 를 가져다 쓴다(고치지 않는다).
// 스케줄은 apps/api/vercel.json 의 crons — A팀 파일이라 B팀이 넣지 않는다(팀에 요청). 경로 · 일정은 newsRules.js 의 SCHEDULE.
//   /api/cron/community-news   뉴스 수집(newsProvider.js — 구글 뉴스 RSS 검색), 매일 06:00 KST
//   /api/cron/community-polls  closesAt 이 지난 투표의 closedAt 채우기, 매일 00:00 KST
import { Router } from 'express';
import { cronGuard } from '../../middlewares/cronGuard.js';
import { runNewsCollection, runPollClosing } from './controller.js';
import { SCHEDULE } from './newsRules.js';

const router = Router();

router.get(SCHEDULE.news.path, cronGuard, runNewsCollection);
router.get(SCHEDULE.polls.path, cronGuard, runPollClosing);

export default router;
