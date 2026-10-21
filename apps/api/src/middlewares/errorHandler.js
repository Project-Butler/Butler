// 중앙 에러 처리 미들웨어(4-인자 Express 에러 핸들러). 라우터/서비스가 던진
// AppError를 api-contract.md 1장의 에러 Envelope로 바꿔서 응답한다. app.js의
// 맨 마지막, 모든 라우터 뒤에 등록해야 한다.
import { AppError } from '../platform/AppError.js';
import { prisma } from '../platform/prismaClient.js';

// express.json()(body-parser)이 던지는 요청 본문 오류. 계약 1장 상태 코드에 413이 없어서 모두 400으로 돌려준다.
const BODY_ERROR_MESSAGES = {
  'entity.parse.failed': '요청 본문이 올바른 JSON이 아닙니다.',
  'entity.too.large': '요청 본문이 너무 큽니다.',
};

const toBodyError = (error) => {
  if (!error?.type || !(error.status >= 400 && error.status < 500)) return null;
  const message = BODY_ERROR_MESSAGES[error.type] ?? '요청 본문을 읽을 수 없습니다.';
  return new AppError('VALIDATION_ERROR', 400, message, [{ field: 'body', reason: message }]);
};

// 외래키 위반 중 *_user_id_fkey: 토큰은 유효한데 그 사용자가 DB에서 지워진 경우다.
// authGuard는 DB를 보지 않으므로(요청마다 조회하지 않음) 여기서만 확인해 401로 바꾼다.
// Prisma 쿼리는 P2003(meta.field_name), $queryRaw는 P2010(meta.code 23503, meta.message)로 온다.
const USER_FK_PATTERN = /_user_id_fkey\b/;
const isUserForeignKeyError = (error) =>
  (error?.code === 'P2003' && USER_FK_PATTERN.test(String(error.meta?.field_name ?? ''))) ||
  (error?.code === 'P2010' && error.meta?.code === '23503' && USER_FK_PATTERN.test(String(error.meta?.message ?? '')));

const defaultUserExists = async (userId) =>
  Boolean(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }));

const toMissingUserError = async (error, req, userExists) => {
  if (!req.user?.id || !isUserForeignKeyError(error)) return null;
  try {
    if (await userExists(req.user.id)) return null;
  } catch {
    return null;
  }
  return new AppError('UNAUTHENTICATED', 401, '로그인이 필요합니다.');
};

export const createErrorHandler = ({ userExists = defaultUserExists } = {}) =>
  async (rawError, req, res, _next) => {
    const error = toBodyError(rawError) ?? (await toMissingUserError(rawError, req, userExists)) ?? rawError;
    const isAppError = error instanceof AppError;

    if (!isAppError) {
      // 예상 못 한 에러는 내부 메시지를 그대로 노출하지 않는다. 서버 로그에만 남긴다.
      console.error('[INTERNAL_ERROR]', req.requestId, error);
    }

    const httpStatus = isAppError ? error.httpStatus : 500;
    const code = isAppError ? error.code : 'INTERNAL_ERROR';
    const message = isAppError ? error.message : '서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    const details = isAppError ? error.details : [];

    res.status(httpStatus).json({
      error: { code, message, details, requestId: req.requestId ?? null },
    });
  };

export const errorHandler = createErrorHandler();
