import { getAdminJobList } from '@butler/api-client';
import { useCursorList } from './useCursorList';

// 작업 목록 최근 순(GET /admin/jobs). data = { items, meta: { nextCursor, hasNext } }. loadMore()로 다음 쪽.
export const useGetAdminJobList = ({ status, size = 30 } = {}, { onUnauthorized } = {}) =>
  useCursorList(getAdminJobList, { status, size }, { onUnauthorized });
