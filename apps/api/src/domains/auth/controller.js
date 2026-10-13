import {
  clearAuthCookies,
  findUserByCredentials,
  findUserById,
  setAuthCookies,
  toPublicUser,
  verifyRefreshToken,
} from './service.js';

export const login = (req, res) => {
  const { email, password } = req.body ?? {};
  const user = findUserByCredentials(email, password);

  if (!user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  setAuthCookies(res, user);
  return res.status(200).json({ user: toPublicUser(user) });
};

export const refresh = (req, res) => {
  const token = req.cookies?.refresh_token;

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '다시 로그인해주세요.' });
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = findUserById(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '다시 로그인해주세요.' });
    }

    setAuthCookies(res, user);
    return res.status(200).end();
  } catch (error) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '다시 로그인해주세요.' });
  }
};

export const logout = (req, res) => {
  clearAuthCookies(res);
  return res.status(200).end();
};

export const me = (req, res) => {
  const user = findUserById(req.user.id);

  if (!user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }

  return res.status(200).json(toPublicUser(user));
};
