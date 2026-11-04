import axiosInstance from '../../axios/axiosInstance';

// body: { uploadSessionId, resourceType?, resourceId? }. 둘 다 빼면 미연결 문서(24시간 안에 붙여야 남는다).
// 에러: 422 UPLOAD_NOT_COMPLETED·UPLOAD_SESSION_EXPIRED·ATTACHMENT_LIMIT_EXCEEDED·MANAGEMENT_LOG_READ_ONLY
export const postDocument = async (body) => {
  const { data } = await axiosInstance.post('/documents', body);
  return data.data;
};
