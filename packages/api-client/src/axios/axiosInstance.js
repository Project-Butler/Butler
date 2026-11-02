import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_SERVER_API_URL,
  withCredentials: true,
  // api-contract.md 1장 "CSRF": 상태를 바꾸는 요청에 이 헤더가 없으면 403이다.
  // GET에도 그냥 같이 보내는 쪽이 요청마다 분기하는 것보다 단순하다.
  headers: { 'X-Requested-With': 'butler-web' },
});

// 이미 /login이면 다시 이동하지 않는다(이동 = 전체 새로고침이라 루프의 씨앗이 된다).
const redirectToLogin = () => {
  if (window.location.pathname !== '/login') window.location.href = '/login';
};

// 토큰 교체(rotation) 방식이라 refresh를 동시에 여러 번 부르면 먼저 쓴 토큰이 무효가 되어 나머지가 실패한다.
// 요청 여러 개가 한꺼번에 만료돼도 refresh는 한 번만 부르고 결과를 같이 기다린다.
let refreshPromise = null;
const refreshOnce = () => {
  refreshPromise ??= axiosInstance.post('/auth/refresh').finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.error?.code;
    // 앱을 열 때 로그인 상태를 확인하는 GET /auth/me와, 그 안에서 불리는 POST /auth/refresh는
    // 실패해도 페이지를 옮기지 않는다. 로그인 화면을 보여 주는 건 호출부 몫이고, 여기서
    // /login으로 보내면 새로고침 → /auth/me → refresh 실패 → /login 이동이 무한 반복된다.
    const isSessionProbe = originalRequest?.url === '/auth/me' || originalRequest?.url === '/auth/refresh';

    // AUTH_TOKEN_EXPIRED일 때만 자동 refresh를 시도한다.
    if (errorCode === 'AUTH_TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await refreshOnce();
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        if (!isSessionProbe) redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    // UNAUTHENTICATED(토큰 자체가 없음)이거나 refresh가 무효화된 경우만 세션이
    // 끊긴 것으로 보고 로그인 화면으로 보낸다. AUTH_INVALID_CREDENTIALS 같은
    // 401(예: 로그인 폼에서 비밀번호 틀림)은 호출부가 직접 처리하게 그대로 둔다.
    if (!isSessionProbe && (errorCode === 'UNAUTHENTICATED' || errorCode === 'AUTH_REFRESH_INVALID')) {
      redirectToLogin();
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
