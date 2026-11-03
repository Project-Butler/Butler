import axiosInstance from '../../axios/axiosInstance';
import { resolveApiUrl } from '../../axios/resolveApiUrl';

// body: { fileName, mimeType, sizeBytes, documentType('PHOTO' 등) }
// 응답 { id, uploadUrl(바로 쓸 수 있는 절대 주소), method: 'PUT', headers, expiresAt }.
// 저장소를 쓸 수 없는 환경이면 503 STORAGE_UNAVAILABLE, 형식·크기는 422 FILE_TYPE_NOT_ALLOWED·FILE_TOO_LARGE.
export const postUploadSession = async (body) => {
  const { data } = await axiosInstance.post('/files/upload-sessions', body);
  return { ...data.data, uploadUrl: resolveApiUrl(data.data.uploadUrl) };
};
