// 중앙 에러 처리 미들웨어(4-인자 Express 에러 핸들러). 라우터/서비스가 던진
// AppError를 api-contract.md 1장의 에러 Envelope로 바꿔서 응답한다. app.js의
// 맨 마지막, 모든 라우터 뒤에 등록해야 한다.
import { AppError } from '../platform/AppError.js';

export const errorHandler = (error, req, res, _next) => {
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
