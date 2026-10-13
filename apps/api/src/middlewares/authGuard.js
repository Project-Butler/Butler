import jwt from 'jsonwebtoken';

export const authGuard = (req, res, next) => {
  const token = req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = { id: payload.userId, role: payload.role };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
};
