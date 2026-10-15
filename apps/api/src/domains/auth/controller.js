import { AppError } from '../../platform/AppError.js';
import { sendData } from '../../platform/respond.js';
import {
  buildAuthMe,
  clearAuthCookies,
  findUserByCredentials,
  findUserById,
  setAuthCookies,
  verifyRefreshToken,
} from './service.js';

export const login = (req, res) => {
  const { email, password } = req.body ?? {};
  const user = findUserByCredentials(email, password);

  if (!user) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 401, '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  setAuthCookies(res, user);
  sendData(res, buildAuthMe(user), { status: 200 });
};

export const refresh = (req, res) => {
  const token = req.cookies?.refresh_token;

  if (!token) {
    throw new AppError('AUTH_REFRESH_INVALID', 401, '다시 로그인해주세요.');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    throw new AppError('AUTH_REFRESH_INVALID', 401, '다시 로그인해주세요.');
  }

  const user = findUserById(payload.userId);
  if (!user) {
    throw new AppError('AUTH_REFRESH_INVALID', 401, '다시 로그인해주세요.');
  }

  setAuthCookies(res, user);
  res.status(204).end();
};

export const logout = (req, res) => {
  clearAuthCookies(res);
  res.status(204).end();
};

export const me = (req, res) => {
  const user = findUserById(req.user.id);

  if (!user) {
    throw new AppError('UNAUTHENTICATED', 401, '로그인이 필요합니다.');
  }

  sendData(res, buildAuthMe(user));
};
