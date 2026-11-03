import axios from 'axios';

// 업로드 세션의 uploadUrl로 파일 본문을 올린다. 서명 주소라 쿠키·CSRF 헤더를 보내지 않는다(외부 Storage도 같은 방식).
// session: postUploadSession 응답. onProgress(0~1)는 선택.
export const putUploadContent = async (session, file, { onProgress } = {}) => {
  await axios.request({
    url: session.uploadUrl,
    method: session.method,
    headers: session.headers,
    data: file,
    withCredentials: false,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    },
  });
};
