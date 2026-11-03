import axiosInstance from '../../axios/axiosInstance';
import { resolveApiUrl } from '../../axios/resolveApiUrl';

// 문서 한 건의 다운로드 주소(5분 유효). 응답 { url(바로 쓸 수 있는 절대 주소), expiresAt }
export const postDocumentDownloadUrl = async (documentId) => {
  const { data } = await axiosInstance.post(`/documents/${documentId}/download-url`);
  return { ...data.data, url: resolveApiUrl(data.data.url) };
};
