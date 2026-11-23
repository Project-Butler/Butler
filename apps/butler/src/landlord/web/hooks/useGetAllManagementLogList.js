import { useEffect, useState } from 'react';
import { getManagementLogList } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../../../shared/apiError';
import { mergeLogsById } from '../utils/houseLogTimeline';

// 한 번에 읽는 크기(목록 API 최대).
const PAGE_SIZE = 100;
// 안전장치: 이만큼 읽고도 끝나지 않으면 멈춘다(축 상한 4년이라 보통 1~2쪽).
const MAX_PAGES = 20;

// 타임라인용 하우스 로그 전부(GET /management-logs를 100건씩 끝까지). 오프셋 페이지라 읽는 사이 추가·삭제로 겹칠 수 있어 id로 합친다.
// params: { propertyId?, scope?, from?, until? } — 값이 바뀌면 처음부터 다시 읽는다. enabled=false면 읽지 않는다.
// data = 기록 배열(날짜 최근 순). 401이면 오류 대신 onUnauthorized(로그인 화면으로)를 부른다.
export const useGetAllManagementLogList = ({ propertyId, scope, from, until, enabled = true, reloadKey } = {}, { onUnauthorized } = {}) => {
  const [state, setState] = useState({ data: null, error: null, isLoading: enabled });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, isLoading: false });
      return undefined;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const load = async () => {
      try {
        const pages = [];
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const { data: items, meta } = await getManagementLogList({ propertyId, scope, from, until, page, size: PAGE_SIZE });
          if (ignore) return;
          pages.push(items);
          if (!meta?.hasNext) break;
        }
        setState({ data: mergeLogsById(...pages), error: null, isLoading: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState((prev) => ({ ...prev, error: toApiError(error), isLoading: false }));
      }
    };
    load();

    return () => {
      ignore = true;
    };
  }, [propertyId, scope, from, until, enabled, reloadKey, onUnauthorized]);

  return state;
};
