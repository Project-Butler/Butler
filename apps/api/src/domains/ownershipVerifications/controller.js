// 권리자 인증 요청 형식 검사와 응답. 절차는 service.js.
import { AppError } from '../../platform/AppError.js';
import { parseRunnerResult } from '../../platform/ownershipVerificationRules.js';
import { assertAllowedBody, assertSingleValues, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRunnerSignature } from './runnerSignature.js';
import {
  findAttemptForUser,
  findLatestAttempt,
  findRenewalTargets,
  receiveRunnerResult,
  startOwnershipVerification,
} from './service.js';

const START_FIELDS = ['ownershipId', 'consent'];
const RESULT_FIELDS = ['attemptId', 'kind', 'ledgerKind', 'owners'];

// 400 details에 입력값을 담지 않는다.
export const parseStartBody = (body) => {
  assertAllowedBody(body, START_FIELDS);
  const details = [];
  if (!isUuid(body.ownershipId)) details.push({ field: 'ownershipId', reason: 'UUID여야 합니다.' });
  if (body.consent !== true) details.push({ field: 'consent', reason: 'CONSENT_REQUIRED' });
  throwIfInvalid(details);
  return { ownershipId: body.ownershipId };
};

const throwInvalidResult = () => {
  throw new AppError('VALIDATION_ERROR', 400, '결과 형식이 올바르지 않습니다.', [{ field: 'body', reason: 'INVALID_RUNNER_RESULT' }]);
};

// 서명을 먼저 본 뒤 파싱한다. JSON.parse 오류 메시지에는 본문 일부가 들어가므로 쓰지 않는다.
export const parseSignedResult = (req, attemptId, secret = process.env.OWNERSHIP_VERIFICATION_RUNNER_SECRET) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const isSigned = verifyRunnerSignature({
    secret,
    timestamp: req.get(TIMESTAMP_HEADER),
    signature: req.get(SIGNATURE_HEADER),
    body: rawBody,
  });
  if (!isSigned) throw new AppError('VERIFICATION_RUNNER_SIGNATURE_INVALID', 401, '서명이 올바르지 않습니다.');

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throwInvalidResult();
  }
  // 서명은 경로를 덮지 않으므로, 서명된 본문의 attemptId가 경로와 같아야 한다.
  if (!isUuid(attemptId) || body?.attemptId !== attemptId) throwInvalidResult();
  if (Object.keys(body).some((key) => !RESULT_FIELDS.includes(key))) throwInvalidResult();

  const result = parseRunnerResult(body);
  if (!result) throwInvalidResult();
  return result;
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postOwnershipVerification = async (req, res, next) => {
  try {
    sendData(res, await startOwnershipVerification(req.user, parseStartBody(req.body), req), { status: 202 });
  } catch (error) {
    next(error);
  }
};

export const getOwnershipVerification = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    if (!isUuid(attemptId)) throw new AppError('OWNERSHIP_VERIFICATION_NOT_FOUND', 404, '인증 시도를 찾을 수 없습니다.');
    sendData(res, await findAttemptForUser(req.user, attemptId));
  } catch (error) {
    next(error);
  }
};

export const getLatestOwnershipVerification = async (req, res, next) => {
  try {
    assertSingleValues(req.query);
    if (!isUuid(req.query.ownershipId)) throwIfInvalid([{ field: 'ownershipId', reason: 'UUID여야 합니다.' }]);
    sendData(res, await findLatestAttempt(req.user, req.query.ownershipId));
  } catch (error) {
    next(error);
  }
};

export const listRenewalTargets = async (req, res, next) => {
  try {
    sendData(res, await findRenewalTargets(req.user));
  } catch (error) {
    next(error);
  }
};

// 사용자 인증 없이 서명만 본다. 늦은 결과도 200이다(accepted: false).
export const postOwnershipVerificationResult = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const result = parseSignedResult(req, attemptId);
    sendData(res, await receiveRunnerResult(attemptId, result));
  } catch (error) {
    next(error);
  }
};
