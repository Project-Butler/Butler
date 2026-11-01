// api-contract.md 9장 플랫폼 공유 함수 audit.record(), 10장 "감사 로그 액션".
// 감사 로그는 남기기만 하고 수정·삭제하지 않는다. 조회는 GET /api/v1/admin/audit-logs(8장).
import { prisma } from './prismaClient.js';

// before/after에서 빼는 키(10장: 비밀번호·토큰·연락처 원문은 넣지 않는다). 중첩 객체 안의 같은 키도 뺀다.
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'refreshTokenHash',
  'resetToken',
  'phone',
  'tenantPhone',
]);

export const stripSensitive = (value) => {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key))
      .map(([key, child]) => [key, stripSensitive(child)]),
  );
};

// JSON 칸에 BigInt가 들어가면 Prisma가 직렬화하지 못해서 문자열로 바꾼다.
const toJson = (value) => {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(stripSensitive(value), (_key, child) => (typeof child === 'bigint' ? child.toString() : child)));
};

// actor: req.user({ id, role }) 또는 null(시스템 작업 → SYSTEM).
// req를 주면 requestId·ip를 같이 남긴다.
// client: 본 작업과 같은 트랜잭션에 넣을 때 tx를 넘긴다(본 작업이 롤백되면 감사 로그도 남지 않는다). 기본은 prisma.
const record = ({ actor = null, action, resourceType, resourceId = null, summary = null, before, after, req, client = prisma }) =>
  client.auditLog.create({
    data: {
      actorType: actor?.id ? 'USER' : 'SYSTEM',
      actorId: actor?.id ?? null,
      action,
      resourceType,
      resourceId,
      summary,
      before: toJson(before),
      after: toJson(after),
      requestId: req?.requestId ?? null,
      ip: req?.ip ?? null,
    },
  });

export const audit = Object.freeze({ record });
