import { useCallback, useEffect, useMemo } from 'react';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { isUnauthorizedError, toApiError } from './apiError';

// 서버 데이터 훅의 공통 바탕(react-query). 화면에는 예전 훅과 같은 { data, error, isLoading, refetch }를 돌려준다.
// - 같은 키의 데이터는 캐시에 남아, 화면을 다시 열면 이전 결과를 바로 보여 주고 뒤에서 새로 받는다(깜빡임 없음).
// - data는 없으면 null. error는 toApiError 모양(401은 오류 대신 onUnauthorized로 로그인 화면 이동).
// - isLoading은 "보여 줄 데이터가 아직 없는 로딩"이다. 캐시가 있는 뒤의 재조회에서는 false.
const useUnauthorizedEffect = (error, onUnauthorized) => {
  const isUnauthorized = isUnauthorizedError(error);
  useEffect(() => {
    if (isUnauthorized) onUnauthorized?.();
  }, [isUnauthorized, onUnauthorized]);
  return isUnauthorized;
};

export const useApiQuery = ({ queryKey, queryFn, enabled = true, onUnauthorized, ...options }) => {
  const query = useQuery({ queryKey, queryFn, enabled, ...options });
  const isUnauthorized = useUnauthorizedEffect(query.error, onUnauthorized);
  const error = useMemo(() => (query.error && !isUnauthorized ? toApiError(query.error) : null), [query.error, isUnauthorized]);
  const { refetch: queryRefetch } = query;
  const refetch = useCallback(() => {
    queryRefetch();
  }, [queryRefetch]);

  return {
    data: query.data ?? null,
    error,
    isLoading: enabled && query.data === undefined && !query.isError,
    refetch,
  };
};

// 목록: page를 올리면 앞 페이지 결과 뒤에 이어 붙인다([더 보기]). 필터(키)가 바뀌면 새 결과가 올 때까지 이전 목록을 둔다.
// fetchPage(page) → { items, meta }. 목록 필터는 queryKey에 넣는다(page는 넣지 않는다).
// data = { items, meta(마지막으로 받은 페이지) }. refetch()는 마지막 페이지를 다시 받는다(오류가 난 페이지 재시도용).
export const useApiPagedQuery = ({ queryKey, fetchPage, page = 1, enabled = true, onUnauthorized }) => {
  const results = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: [...queryKey, { page: index + 1 }],
      queryFn: () => fetchPage(index + 1),
      enabled,
      placeholderData: keepPreviousData,
    })),
  });
  const last = results[results.length - 1];
  const failed = results.find((result) => result.isError);
  const isUnauthorized = useUnauthorizedEffect(failed?.error, onUnauthorized);
  const error = useMemo(() => (failed?.error && !isUnauthorized ? toApiError(failed.error) : null), [failed?.error, isUnauthorized]);

  const loaded = results.filter((result) => result.data !== undefined);
  const lastMeta = loaded.length > 0 ? loaded[loaded.length - 1].data.meta : null;
  const itemsKey = loaded.map((result) => result.dataUpdatedAt).join(',');
  // 페이지 결과가 바뀔 때만 새 배열을 만든다(화면의 useMemo·effect 의존성이 흔들리지 않게).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => (loaded.length > 0 ? { items: loaded.flatMap((result) => result.data.items), meta: lastMeta } : null), [itemsKey, lastMeta]);

  const lastRefetch = last.refetch;
  const refetch = useCallback(() => {
    lastRefetch();
  }, [lastRefetch]);

  // 마지막 페이지를 새로 받는 중일 때만(더 보기·재시도·필터 바꾼 직후) 로딩이다. 캐시가 있는 목록을 뒤에서 새로 받을 때는 아니다.
  const isLoading = enabled && last.isFetching && (last.data === undefined || last.isPlaceholderData);

  return { data, error, isLoading, refetch };
};
