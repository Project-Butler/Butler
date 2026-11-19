import { useEffect, useState } from 'react';
import { getSearch } from '@butler/api-client';
import { isUnauthorizedError, toApiError } from '../apiError';
import { isSearchableQuery, normalizeQuery } from './searchView';

export const SEARCH_DEBOUNCE_MS = 300;

// 통합 검색(GET /search). 입력이 멈추고 300ms 뒤에 부른다. 2자 미만이면 부르지 않고 결과를 비운다.
// 새 검색을 기다리는 동안에는 앞 결과를 그대로 보여 준다(화면이 깜빡이지 않게). searchedQuery 는 data 가 어느 검색어의 결과인지.
export const useGetSearch = (rawQuery, { onUnauthorized } = {}) => {
  const query = normalizeQuery(rawQuery);
  const searchable = isSearchableQuery(query);
  const [state, setState] = useState({ data: null, searchedQuery: '', error: null, isLoading: false });

  useEffect(() => {
    if (!searchable) {
      setState({ data: null, searchedQuery: '', error: null, isLoading: false });
      return undefined;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    const timer = setTimeout(async () => {
      try {
        const data = await getSearch({ query });
        if (!ignore) setState({ data, searchedQuery: query, error: null, isLoading: false });
      } catch (error) {
        if (ignore) return;
        if (isUnauthorizedError(error)) {
          onUnauthorized?.();
          return;
        }
        setState({ data: null, searchedQuery: query, error: toApiError(error), isLoading: false });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, searchable, onUnauthorized]);

  return { ...state, query, searchable };
};
