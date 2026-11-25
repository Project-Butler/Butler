import { QueryClient } from '@tanstack/react-query';

// 서버 데이터 캐시. 세션이 끝나면(store/sessionStore clearSession) 비워, 다음 사용자에게 이전 사용자의 데이터가 보이지 않게 한다.
// 미리보기(DisputeChatPreview 등)는 자기 QueryClient를 따로 쓴다.
// 4xx(없음·권한·세션 만료)는 다시 불러도 같아서 재시도하지 않는다. 그 밖의 오류만 한 번 더 시도한다.
const retryUnlessClientError = (failureCount, error) => {
  const status = error?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 1;
};

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryUnlessClientError, refetchOnWindowFocus: false } } });

// 서버 데이터를 바꾸는 요청(POST·PATCH·PUT·DELETE)이 성공하면 지금 화면에 없는 캐시는 버린다.
// 등록·수정·삭제 뒤에 다른 화면을 열 때 옛 목록이 잠깐 보였다 바뀌는 일을 막는다(그 화면은 처음처럼 스켈레톤부터).
// 지금 화면에 떠 있는 데이터는 건드리지 않는다. 바꾼 쪽이 refetch로 맞춘다. main.jsx가 앱을 띄울 때 한 번 건다.
export const dropInactiveQueriesAfterWrite = (axiosInstance) =>
  axiosInstance.interceptors.response.use((response) => {
    const method = response.config?.method?.toLowerCase();
    if (method && method !== 'get') queryClient.removeQueries({ type: 'inactive' });
    return response;
  });
