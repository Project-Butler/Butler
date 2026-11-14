// 임차인 초대 요청 형식 검사와 응답. 규칙은 service.js·rules.js.
import { AppError } from '../../platform/AppError.js';
import { assertAllowedBody, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { MAX_SHARED_DOCUMENTS, isPhoneLast4Format } from './rules.js';
import {
  acceptInvitation,
  findInvitationContract,
  findInvitationSummary,
  issueInvitation,
  issueInvitationDocumentDownloadUrl,
  listInvitations,
  verifyInvitation,
} from './service.js';
import { VERIFICATION_COOKIE, clearVerificationCookie, setVerificationCookie } from './verificationSession.js';

const throwContractNotFound = () => {
  throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
};

const parseIssueBody = (body) => {
  const input = body ?? {};
  assertAllowedBody(input, ['sharedDocumentIds']);
  const ids = input.sharedDocumentIds ?? [];
  const details = [];
  if (!Array.isArray(ids) || ids.some((id) => !isUuid(id))) {
    details.push({ field: 'sharedDocumentIds', reason: 'UUID 배열이어야 합니다.' });
  }
  throwIfInvalid(details);
  const unique = [...new Set(ids)];
  if (unique.length > MAX_SHARED_DOCUMENTS) {
    throw new AppError('ATTACHMENT_LIMIT_EXCEEDED', 422, `계약서는 ${MAX_SHARED_DOCUMENTS}개까지 공유할 수 있어요.`);
  }
  return { sharedDocumentIds: unique };
};

const parseVerifyBody = (body) => {
  const input = body ?? {};
  assertAllowedBody(input, ['phoneLast4']);
  const details = [];
  if (!isPhoneLast4Format(input.phoneLast4)) details.push({ field: 'phoneLast4', reason: '숫자 4자리여야 합니다.' });
  throwIfInvalid(details);
  return input.phoneLast4;
};

// A-06
export const postTenantInvitation = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    if (!isUuid(contractId)) throwContractNotFound();
    sendData(res, await issueInvitation(req.user, contractId, parseIssueBody(req.body), req), { status: 201 });
  } catch (error) {
    next(error);
  }
};

// A-07
export const getTenantInvitations = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    if (!isUuid(contractId)) throwContractNotFound();
    sendData(res, await listInvitations(req.user, contractId));
  } catch (error) {
    next(error);
  }
};

// A-08
export const getTenantInvitationSummary = async (req, res, next) => {
  try {
    sendData(res, await findInvitationSummary(req.params.token));
  } catch (error) {
    next(error);
  }
};

// 대기·하루 한도 응답. retryAfterSeconds는 details와 Retry-After 헤더로 준다(실패 횟수는 넣지 않는다).
const limitedError = (code, message, retryAfterSeconds, res) => {
  res.set('Retry-After', String(retryAfterSeconds));
  return new AppError(code, 429, message, [{ field: 'retryAfterSeconds', reason: 'WAIT', retryAfterSeconds }]);
};

// V-01 — 결과값을 받은 뒤(커밋 뒤) 응답을 정한다.
export const postTenantInvitationVerify = async (req, res, next) => {
  try {
    const phoneLast4 = parseVerifyBody(req.body);
    const outcome = await verifyInvitation({ token: req.params.token, phoneLast4, currentSecret: req.cookies?.[VERIFICATION_COOKIE] ?? null });
    if (outcome.kind === 'OK') {
      setVerificationCookie(res, outcome.secret);
      return sendData(res, { verified: true, expiresAt: outcome.expiresAt.toISOString() });
    }
    if (outcome.kind === 'FAIL') {
      throw new AppError('INVITATION_VERIFY_FAILED', 422, '휴대폰 번호 뒤 4자리가 계약 정보와 달라요. 다시 확인해 주세요.');
    }
    if (outcome.kind === 'WAIT') {
      throw limitedError('INVITATION_VERIFY_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', outcome.retryAfterSeconds, res);
    }
    throw limitedError(
      'INVITATION_VERIFY_DAILY_LIMIT',
      '오늘은 더 확인할 수 없어요. 관리자에게 문의해 주세요.',
      outcome.retryAfterSeconds,
      res,
    );
  } catch (error) {
    return next(error);
  }
};

// V-02
export const getTenantInvitationContract = async (req, res, next) => {
  try {
    sendData(res, await findInvitationContract(req.params.token, req));
  } catch (error) {
    next(error);
  }
};

// V-03
export const postTenantInvitationDocumentDownloadUrl = async (req, res, next) => {
  try {
    const { token, documentId } = req.params;
    sendData(res, await issueInvitationDocumentDownloadUrl(token, documentId, req, { isValidDocumentId: isUuid(documentId) }));
  } catch (error) {
    next(error);
  }
};

// A-09 — 성공하면 확인 세션 쿠키를 지운다.
export const postTenantInvitationAccept = async (req, res, next) => {
  try {
    const contract = await acceptInvitation(req.user, req.params.token, req);
    clearVerificationCookie(res);
    sendData(res, contract);
  } catch (error) {
    next(error);
  }
};
