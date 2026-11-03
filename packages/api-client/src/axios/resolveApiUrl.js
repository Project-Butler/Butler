// 서버가 돌려준 업로드·다운로드 주소를 브라우저가 바로 쓸 수 있는 절대 주소로 바꾼다.
// 임시 로컬 저장소는 '/api/v1/...'처럼 API 기준 상대 경로를 준다. VITE_SERVER_API_URL이
// 절대 주소(http://localhost:4000/api/v1)면 그 origin에, 상대 경로(/api/v1, 같은 origin 프록시)면 지금 페이지 origin에 붙인다.
// 이미 절대 주소(외부 Storage 서명 URL)면 그대로 둔다.
export const resolveApiUrl = (url, baseUrl = import.meta.env.VITE_SERVER_API_URL ?? '/') => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = new URL(baseUrl, window.location.origin);
  return new URL(url, base.origin).toString();
};
