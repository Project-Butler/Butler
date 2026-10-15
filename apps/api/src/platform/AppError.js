// 도메인 로직에서 던지는 표준 에러. 라우터/서비스는 res.status().json()을 직접
// 쓰지 않고 이 에러를 throw(또는 next(error))하면 middlewares/errorHandler.js가
// api-contract.md 1장의 Envelope({ error: { code, message, details, requestId } })로
// 바꿔서 응답한다. 전체 code 목록은 api-contract.md 10장.
export class AppError extends Error {
  constructor(code, httpStatus, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
