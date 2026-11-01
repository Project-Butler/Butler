// createdAt desc, id desc로 정렬한 커서 방식 목록(api-contract.md 1장 "목록 조회")의 커서.
// 마지막 항목의 두 값을 base64url로 묶어 다음 페이지 기준으로 쓴다. 감사 로그·작업 목록이 쓴다.
import { isUuid } from './uuid.js';

export const encodeCreatedAtCursor = ({ createdAt, id }) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');

// 형식이 틀리면 null(컨트롤러가 400으로 바꾼다).
export const decodeCreatedAtCursor = (cursor) => {
  const [createdAtText, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(createdAtText);
  if (rest.length > 0 || !isUuid(id) || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
};

// 커서 다음 쪽 조건(where에 펼쳐 넣는다). cursor가 없으면 빈 객체.
export const afterCreatedAtCursor = (cursor) =>
  cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {};

// size + 1건을 읽은 rows를 { items, meta: { nextCursor, hasNext } }로 자른다.
export const toCursorPage = (rows, size) => {
  const hasNext = rows.length > size;
  const items = rows.slice(0, size);
  return { items, meta: { nextCursor: hasNext ? encodeCreatedAtCursor(items[items.length - 1]) : null, hasNext } };
};
