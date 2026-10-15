import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_SERVER_API_URL,
  withCredentials: true,
  // api-contract.md 1장 "CSRF": 상태를 바꾸는 요청에 이 헤더가 없으면 403이다.
  // GET에도 그냥 같이 보내는 쪽이 요청마다 분기하는 것보다 단순하다.
  headers: { 'X-Requested-With': 'butler-web' },
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.error?.code;

    // AUTH_TOKEN_EXPIRED일 때만 자동 refresh를 시도한다.
    if (errorCode === 'AUTH_TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axiosInstance.post('/auth/refresh');
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // UNAUTHENTICATED(토큰 자체가 없음)이거나 refresh가 무효화된 경우만 세션이
    // 끊긴 것으로 보고 로그인 화면으로 보낸다. AUTH_INVALID_CREDENTIALS 같은
    // 401(예: 로그인 폼에서 비밀번호 틀림)은 호출부가 직접 처리하게 그대로 둔다.
    if (errorCode === 'UNAUTHENTICATED' || errorCode === 'AUTH_REFRESH_INVALID') {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
