import { getManagementLogList, queryKey } from '@butler/api-client';
import { useApiQuery } from '../../../shared/useApiQuery';
import { mergeLogsById } from '../utils/houseLogTimeline';

// 한 번에 읽는 크기(목록 API 최대).
const PAGE_SIZE = 100;
// 안전장치: 이만큼 읽고도 끝나지 않으면 멈춘다(축 상한 4년이라 보통 1~2쪽).
const MAX_PAGES = 20;

const fetchAllLogs = async (params) => {
  const pages = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data: items, meta } = await getManagementLogList({ ...params, page, size: PAGE_SIZE });
    pages.push(items);
    if (!meta?.hasNext) break;
  }
  return mergeLogsById(...pages);
};

// 타임라인용 하우스 로그 전부(GET /management-logs를 100건씩 끝까지). 오프셋 페이지라 읽는 사이 추가·삭제로 겹칠 수 있어 id로 합친다.
// params: { propertyId?, scope?, from?, until? } — 값이 바뀌면 처음부터 다시 읽는다. enabled=false면 읽지 않는다.
// reloadKey가 바뀌면(기록 추가·삭제 뒤) 다시 읽되, 새 결과가 올 때까지 지금 점을 그대로 둔다(같은 조건일 때만).
// data = 기록 배열(날짜 최근 순). 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAllManagementLogList = ({ propertyId, scope, from, until, enabled = true, reloadKey } = {}, { onUnauthorized } = {}) => {
  const params = { propertyId, scope, from, until };
  return useApiQuery({
    queryKey: [queryKey.MANAGEMENT_LOGS_ALL, params, { reloadKey }],
    queryFn: () => fetchAllLogs(params),
    enabled,
    placeholderData: (previousData, previousQuery) =>
      previousQuery && JSON.stringify(previousQuery.queryKey[1]) === JSON.stringify(params) ? previousData : undefined,
    onUnauthorized,
  });
};
