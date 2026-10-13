import jwt from 'jsonwebtoken';

// TODO(A팀, DB 연결 시 교체): 지금은 fixture 유저. 비밀번호도 평문 비교라 실제 구현에서는
// Prisma User 테이블 조회 + bcrypt.compare로 바꿔야 한다. Core Integration Contract의
// 응답 모양(user 필드/role 값)은 그대로 유지한 채 내부 구현만 교체하면 된다.
const FIXTURE_USERS = [
  { id: 'u-landlord-1', email: 'landlord@butler.test', password: 'password123', name: '김집주', role: 'landlord' },
  { id: 'u-tenant-1', email: 'tenant@butler.test', password: 'password123', name: '이세입', role: 'tenant' },
  { id: 'u-admin-1', email: 'admin@butler.test', password: 'password123', name: '박운영', role: 'admin' },
];

const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분
const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14일

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

export const findUserByCredentials = (email, password) =>
  FIXTURE_USERS.find((user) => user.email === email && user.password === password) ?? null;

export const findUserById = (id) => FIXTURE_USERS.find((user) => user.id === id) ?? null;

export const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

export const signAccessToken = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30m' });

export const signRefreshToken = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '14d' });

export const verifyRefreshToken = (token) => jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

export const setAuthCookies = (res, user) => {
  res.cookie('access_token', signAccessToken(user), { ...cookieOptions, maxAge: ACCESS_TOKEN_TTL_MS });
  res.cookie('refresh_token', signRefreshToken(user), { ...cookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
};

export const clearAuthCookies = (res) => {
  res.clearCookie('access_token', cookieOptions);
  res.clearCookie('refresh_token', cookieOptions);
};
