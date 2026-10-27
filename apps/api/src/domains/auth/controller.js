import { AppError } from '../../platform/AppError.js';
import { sendData } from '../../platform/respond.js';
import {
  buildAuthMe,
  clearAuthCookies,
  findUserByCredentials,
  findUserById,
  revokeAllSessions,
  revokeSessionByToken,
  rotateSession,
  startSession,
  verifyRefreshToken,
} from './service.js';

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const user = await findUserByCredentials(email, password);

    // 탈퇴한 계정은 없는 계정과 똑같이 응답한다.
    if (!user || user.status === 'WITHDRAWN') {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 401, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError('AUTH_ACCOUNT_SUSPENDED', 403, '정지된 계정입니다. 운영팀에 문의해주세요.');
    }

    await startSession(req, res, user);
    sendData(res, await buildAuthMe(user), { status: 200 });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
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

    const user = await findUserById(payload.userId);
    if (!user) {
      throw new AppError('AUTH_REFRESH_INVALID', 401, '다시 로그인해주세요.');
    }
    // 정지·탈퇴한 계정은 남은 세션을 모두 폐기한다.
    if (user.status !== 'ACTIVE') {
      await revokeAllSessions(user.id);
      throw new AppError('AUTH_REFRESH_INVALID', 401, '다시 로그인해주세요.');
    }

    if (!(await rotateSession(req, res, user, token))) {
      throw new AppError('AUTH_REFRESH_INVALID', 401, '다시 로그인해주세요.');
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (token) await revokeSessionByToken(token);

    clearAuthCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);

    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('UNAUTHENTICATED', 401, '로그인이 필요합니다.');
    }

    sendData(res, await buildAuthMe(user));
  } catch (error) {
    next(error);
  }
};
