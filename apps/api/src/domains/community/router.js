import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  checkLegalDongCode,
  getPoll,
  getPost,
  listMyBuildings,
  listReports,
  listPolls,
  listPosts,
  loadComment,
  loadPoll,
  loadPost,
  patchCommentHidden,
  patchPollHidden,
  patchPostHidden,
  patchPost,
  patchReport,
  postComment,
  postPoll,
  postPost,
  postReport,
  postVote,
  removeComment,
  removePoll,
  removePost,
} from './controller.js';
import { requireRegionMember } from './platformBridge.js';

const router = Router();

// 임대인 커뮤니티(api-contract.md 9장). 읽기는 authGuard, 쓰기는 roleGuard(['LANDLORD']) +
// requireRegionMember(platformBridge.js). 경로마다 역할을 따로 건다.
router.use(authGuard);

// 내 건물은 임대인 본인 것이라 LANDLORD만(임차인 읽기 권한 미확정과는 별개).
router.get('/my-buildings', roleGuard(['LANDLORD']), generalRateLimiter, listMyBuildings);

// 게시판 쓰기(작성·수정·댓글·신고): 경로의 법정동, 또는 먼저 찾아 둔 글의 법정동에 자격이 있어야 한다.
// 삭제는 본인 확인만 한다 — 인증이 만료된 사람도 자기 글·댓글을 지울 수 있게(삭제는 내용을 더하지 않는다).
const landlordOnly = roleGuard(['LANDLORD']);
const memberOfPathRegion = requireRegionMember((req) => req.params.legalDongCode);
const memberOfPostRegion = requireRegionMember((req) => req.communityPost.legalDongCode);

router.get('/regions/:legalDongCode/posts', generalRateLimiter, listPosts);
router.post(
  '/regions/:legalDongCode/posts',
  landlordOnly,
  generalRateLimiter,
  checkLegalDongCode,
  memberOfPathRegion,
  postPost,
);
router.get('/posts/:postId', generalRateLimiter, getPost);
router.patch('/posts/:postId', landlordOnly, generalRateLimiter, loadPost, memberOfPostRegion, patchPost);
router.delete('/posts/:postId', landlordOnly, generalRateLimiter, loadPost, removePost);
router.post('/posts/:postId/comments', landlordOnly, generalRateLimiter, loadPost, memberOfPostRegion, postComment);
router.delete('/comments/:commentId', landlordOnly, generalRateLimiter, loadComment, removeComment);
router.post('/posts/:postId/reports', landlordOnly, generalRateLimiter, loadPost, memberOfPostRegion, postReport);

// 투표: 읽기는 authGuard, 등록·참여는 법정동 자격. "우리 단지"(COMPLEX) 자격은 참여 때 서비스가 따로 본다.
const memberOfPollRegion = requireRegionMember((req) => req.communityPoll.legalDongCode);

router.get('/regions/:legalDongCode/polls', generalRateLimiter, listPolls);
router.post(
  '/regions/:legalDongCode/polls',
  landlordOnly,
  generalRateLimiter,
  checkLegalDongCode,
  memberOfPathRegion,
  postPoll,
);
router.get('/polls/:pollId', generalRateLimiter, getPoll);

router.post('/polls/:pollId/votes', landlordOnly, generalRateLimiter, loadPoll, memberOfPollRegion, postVote);
// 삭제는 등록자 본인·참여자 0명일 때만. 자격은 보지 않는다(글 삭제와 같음).
router.delete('/polls/:pollId', landlordOnly, generalRateLimiter, loadPoll, removePoll);

// 운영자. 전부 ADMIN 만. 화면은 A팀 운영자 콘솔이 만든다.
const adminOnly = roleGuard(['ADMIN']);

router.get('/admin/reports', adminOnly, generalRateLimiter, listReports);
router.patch('/admin/reports/:reportId', adminOnly, generalRateLimiter, patchReport);
router.patch('/admin/posts/:postId/hidden', adminOnly, generalRateLimiter, patchPostHidden);
router.patch('/admin/comments/:commentId/hidden', adminOnly, generalRateLimiter, patchCommentHidden);
router.patch('/admin/polls/:pollId/hidden', adminOnly, generalRateLimiter, patchPollHidden);

export default router;
