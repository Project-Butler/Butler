// 본인 확인 세션(bt_iv)과 '쓸 수 있는 초대' 확인(docs/11 개발 계획 2-2, api-contract.md 4장 "확인 세션 규칙").
// V-02·V-03·A-09와 가입·OAuth 수락이 함께 쓴다.
import { AppError } from '../../platform/AppError.js';
import { getNow, getTodayKST } from '../../platform/dateUtils.js';
import { VERIFICATION_TTL_MS, invitationUnusableReason, isVerificationUsable, phoneFingerprint, sha256Hex } from './rules.js';

export const VERIFICATION_COOKIE = 'bt_iv';

// 운영은 Secure. 30분 고정(연장 없음).
export const verificationCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1',
});

export const setVerificationCookie = (res, secret) =>
  res.cookie(VERIFICATION_COOKIE, secret, { ...verificationCookieOptions(), maxAge: VERIFICATION_TTL_MS });

export const clearVerificationCookie = (res) => res.clearCookie(VERIFICATION_COOKIE, verificationCookieOptions());

const UNUSABLE_ERRORS = {
  INVITATION_INVALID: [404, '초대 링크를 찾을 수 없어요. 링크를 다시 확인해 주세요.'],
  INVITATION_ALREADY_ACCEPTED: [409, '이미 수락한 초대예요.'],
  INVITATION_EXPIRED: [422, '만료되었거나 더 쓸 수 없는 초대 링크예요. 임대인에게 새 링크를 요청해 주세요.'],
};

export const throwInvitationUnusable = (code) => {
  const [status, message] = UNUSABLE_ERRORS[code];
  throw new AppError(code, status, message);
};

export const throwVerificationRequired = () => {
  throw new AppError('INVITATION_VERIFY_REQUIRED', 403, '본인 확인이 필요해요. 휴대폰 번호 뒤 4자리를 다시 입력해 주세요.');
};

// invitation: TenantInvitation + { contract: CONTRACT_INCLUDE }(또는 null). 쓸 수 없으면 통일 에러를 던진다.
export const assertUsableInvitation = (invitation, now = getNow()) => {
  const reason = invitation
    ? invitationUnusableReason(invitation, {
        contract: invitation.contract,
        ownershipEnded: Boolean(invitation.contract.ownership.endedAt),
        now,
        todayKST: getTodayKST(),
      })
    : 'INVITATION_INVALID';
  if (reason) throwInvitationUnusable(reason);
};

// client: prisma 또는 tx. req.cookies.bt_iv의 확인 세션이 이 초대 것이고 미폐기·미만료이며
// 지금 계약 번호로 만든 것인지 본다. 아니면 403 INVITATION_VERIFY_REQUIRED. 확인 세션 행을 돌려준다.
export const requireVerification = async (client, req, invitation, now = getNow()) => {
  assertUsableInvitation(invitation, now);
  const secret = req?.cookies?.[VERIFICATION_COOKIE];
  if (typeof secret !== 'string' || secret.length === 0 || secret.length > 128) throwVerificationRequired();
  const verification = await client.tenantInvitationVerification.findUnique({ where: { idHash: sha256Hex(secret) } });
  const fingerprint = phoneFingerprint(invitation.contract.id, invitation.contract.tenantPhone);
  if (!isVerificationUsable(verification, { invitationId: invitation.id, fingerprint, now })) throwVerificationRequired();
  return verification;
};
