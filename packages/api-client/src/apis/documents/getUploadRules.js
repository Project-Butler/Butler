import axiosInstance from '../../axios/axiosInstance';

// GET /files/upload-rules — 올릴 수 있는 형식·크기·위치·유효 시간(서버 환경 변수로 바뀐다).
// 응답 { kinds: { IMAGE|PDF|VIDEO: { mimeTypes, extensions, maxBytes } }, resourceKinds: { <resourceType>: ['IMAGE', …] },
//        uploadSessionTtlMs: { IMAGE, PDF, VIDEO }, viewUrlTtlMs: { IMAGE, PDF, VIDEO } }
export const getUploadRules = async () => {
  const { data } = await axiosInstance.get('/files/upload-rules');
  return data.data;
};
