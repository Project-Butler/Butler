import axiosInstance from '../../axios/axiosInstance';

// body: { body(최대 2,000자), attachmentDocumentIds?(최대 5개) }. 보낸 메시지는 수정·삭제할 수 없다.
export const postThreadMessage = async (threadId, body) => {
  const { data } = await axiosInstance.post(`/threads/${threadId}/messages`, body);
  return data.data;
};
