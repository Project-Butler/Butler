// 외부 공공데이터 호출 실패를 나타내는 내부 전용 에러. reason에는 짧은 사유만 담는다 —
// URL·쿼리스트링(키 포함)·응답 원문은 절대 넣지 않는다. callProvider()가 잡아서
// 503 EXTERNAL_SERVICE_UNAVAILABLE(AppError)로 바꾸므로 errorHandler까지 가지 않는다.
export class ExternalServiceError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ExternalServiceError';
    this.reason = reason;
  }
}
