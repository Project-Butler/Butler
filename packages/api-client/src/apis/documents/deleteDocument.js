import axiosInstance from '../../axios/axiosInstance';

// 올린 사람만. 넘어간 이력의 문서는 422 DOCUMENT_NOT_DELETABLE.
export const deleteDocument = async (documentId) => {
  await axiosInstance.delete(`/documents/${documentId}`);
};
