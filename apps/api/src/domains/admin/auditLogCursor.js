// GET /admin/audit-logs 커서(api-contract.md 8장 "커서 방식").
// 정렬이 createdAt desc, id desc라서 마지막 항목의 두 값을 base64url로 묶어 다음 페이지 기준으로 쓴다.
import { isUuid } from '../../platform/uuid.js';

export const encodeAuditLogCursor = ({ createdAt, id }) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');

// 형식이 틀리면 null(컨트롤러가 400으로 바꾼다).
export const decodeAuditLogCursor = (cursor) => {
  const [createdAtText, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(createdAtText);
  if (rest.length > 0 || !isUuid(id) || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
};
