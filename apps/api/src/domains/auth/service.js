import jwt from 'jsonwebtoken';

// TODO(A팀, DB 연결 시 교체): 지금은 fixture 유저. 비밀번호도 평문 비교라 실제 구현에서는
// Prisma User 테이블 조회 + bcrypt.compare로 바꿔야 한다. 응답 모양(AuthMe)은 그대로
// 유지한 채 내부 구현만 교체하면 된다(api-contract.md 1장).
const FIXTURE_USERS = [
  {
    id: 'u-landlord-1',
    email: 'landlord@butler.test',
    password: 'password123',
    name: '김집주',
    phone: '01011112222',
    role: 'LANDLORD',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'u-tenant-1',
    email: 'tenant@butler.test',
    password: 'password123',
    name: '이세입',
    phone: '01033334444',
    role: 'TENANT',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'u-admin-1',
    email: 'admin@butler.test',
    password: 'password123',
    name: '박운영',
    phone: '01055556666',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
];

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15분 (api-contract.md 1장)
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
  email: user.email,
  name: user.name,
  phone: user.phone,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt,
});

// POST /auth/login, POST /auth/register, GET /auth/me가 공통으로 쓰는 응답 모양(AuthMe).
// verifiedLegalDongCodes·activeOwnershipCount는 실제로는 property-ownerships 도메인이
// 계산해야 하는 값인데 그 도메인이 아직 없어서 fixture 단계에선 빈 값으로 둔다.
// TODO(A팀, property-ownerships 도메인 구현 시 실제 값으로 교체)
export const buildAuthMe = (user) => ({
  user: toPublicUser(user),
  verifiedLegalDongCodes: [],
  activeOwnershipCount: 0,
});

export const signAccessToken = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

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
