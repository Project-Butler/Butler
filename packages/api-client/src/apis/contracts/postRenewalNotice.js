import axiosInstance from '../../axios/axiosInstance';

// body: { kind: 'REFUSE_RENEWAL'|'CHANGE_TERMS', method, sentOn: 'YYYY-MM-DD', deliveredOn?: 'YYYY-MM-DD'|null, memo?, attachmentDocumentIds?: [] }
// 증빙은 먼저 미연결 문서로 올리고(postDocument) 그 id를 attachmentDocumentIds로 넘긴다.
export const postRenewalNotice = async (contractId, body) => {
  const { data } = await axiosInstance.post(`/contracts/${contractId}/renewal-notices`, body);
  return data.data;
};
