export const roleGuard = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '접근 권한이 없습니다.' });
  }
  next();
};
