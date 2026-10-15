// 모든 응답에 X-Request-Id 헤더를 붙인다(api-contract.md 1장). 에러 Envelope의
// error.requestId와 감사 로그의 requestId도 여기서 만든 값을 쓴다.
import { randomUUID } from 'crypto';

export const requestId = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
