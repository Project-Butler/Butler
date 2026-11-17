import axiosInstance from '../../axios/axiosInstance';
import { resolveApiUrl } from '../../axios/resolveApiUrl';

// 문서 한 건의 다운로드 주소(5분 유효). 응답 { url(바로 쓸 수 있는 절대 주소), expiresAt }
// purpose: 'VIEW'(기본, 열기·크게 보기·저장 — 감사) | 'THUMBNAIL'(목록의 사진 썸네일 — 사진은 감사하지 않음)
export const postDocumentDownloadUrl = async (documentId, { purpose } = {}) => {
  const { data } = await axiosInstance.post(`/documents/${documentId}/download-url`, purpose ? { purpose } : undefined);
  return { ...data.data, url: resolveApiUrl(data.data.url) };
};
