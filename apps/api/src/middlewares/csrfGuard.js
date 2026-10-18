// api-contract.md 1장 "CSRF": 상태를 바꾸는 요청(POST·PATCH·PUT·DELETE)에는
// X-Requested-With: butler-web 헤더가 필요하다. SameSite=Lax 쿠키가 기본 방어선이고,
// 이 헤더 체크는 단순 CSRF 공격(헤더를 못 붙이는 폼 전송 등)을 한 번 더 막는 용도다.
//
// 앱 전역에 건다(app.js). 프론트는 공용 axiosInstance.js가 모든 요청에 이 헤더를 붙인다.
import { AppError } from '../platform/AppError.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const REQUIRED_HEADER_VALUE = 'butler-web';

export const csrfGuard = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  if (req.get('X-Requested-With') !== REQUIRED_HEADER_VALUE) {
    return next(new AppError('CSRF_HEADER_REQUIRED', 403, 'X-Requested-With 헤더가 필요합니다.'));
  }

  next();
};
