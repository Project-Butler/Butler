import { getAdminAuditLogList } from '@butler/api-client';
import { useCursorList } from './useCursorList';

// 감사 로그 최근 순(GET /admin/audit-logs). data = { items, meta: { nextCursor, hasNext } }.
// 대시보드 "최근 활동 로그"는 첫 쪽만, 감사 로그 화면은 필터와 loadMore("더 보기")까지 쓴다.
// params: { actorId?, action?, resourceType?, resourceId?, from?, to?, size }
export const useGetAdminAuditLogList = ({ size = 30, ...filters } = {}, { onUnauthorized } = {}) =>
  useCursorList(getAdminAuditLogList, { ...filters, size }, { onUnauthorized });
