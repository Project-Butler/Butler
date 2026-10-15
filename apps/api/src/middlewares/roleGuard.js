import { AppError } from '../platform/AppError.js';

export const roleGuard = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(new AppError('FORBIDDEN_ROLE', 403, '접근 권한이 없습니다.'));
  }
  return next();
};
