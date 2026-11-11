import { Router } from 'express';
import { authGuard } from '../../middlewares/authGuard.js';
import { generalRateLimiter, rateLimiter } from '../../middlewares/rateLimiter.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import {
  getTenantInvitationContract,
  getTenantInvitationSummary,
  getTenantInvitations,
  postTenantInvitation,
  postTenantInvitationAccept,
  postTenantInvitationDocumentDownloadUrl,
  postTenantInvitationVerify,
} from './controller.js';

// 공개 경로는 IP 기준 한도(R-16). 기존 rateLimiter(고정 창, 저장소 오류 시 통과)를 쓰고,
// 본인 확인 대입 방지 자체는 초대 행 카운터(fail-closed, service.js)가 따로 한다.
const invitationPublicRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyFn: (req) => `invite-public:${req.ip}`,
  message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
});

const invitationVerifyRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyFn: (req) => `invite-verify:${req.ip}`,
  message: '본인 확인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
});

// api-contract.md 4장 "임차인 초대" — 계약에 붙은 발급·목록(활성 소유자). app.js가 /contracts/:contractId/tenant-invitations에 붙인다.
export const contractTenantInvitationsRouter = Router({ mergeParams: true });
contractTenantInvitationsRouter.use(authGuard, roleGuard(['LANDLORD']), generalRateLimiter);
contractTenantInvitationsRouter.post('/', postTenantInvitation);
contractTenantInvitationsRouter.get('/', getTenantInvitations);

// 토큰 경로(/tenant-invitations/:token...). 요약·본인 확인·열람은 로그인 없이, 수락은 TENANT 로그인 + 확인 세션.
const router = Router();
router.get('/:token', invitationPublicRateLimiter, getTenantInvitationSummary);
router.post('/:token/verify', invitationVerifyRateLimiter, postTenantInvitationVerify);
router.get('/:token/contract', invitationPublicRateLimiter, getTenantInvitationContract);
router.post('/:token/documents/:documentId/download-url', invitationPublicRateLimiter, postTenantInvitationDocumentDownloadUrl);
router.post('/:token/accept', authGuard, roleGuard(['TENANT']), generalRateLimiter, postTenantInvitationAccept);

export default router;
