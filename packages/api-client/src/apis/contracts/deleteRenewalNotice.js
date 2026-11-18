import axiosInstance from '../../axios/axiosInstance';

// 204. 붙은 증빙 문서도 함께 지운다.
export const deleteRenewalNotice = async (contractId, noticeId) => {
  await axiosInstance.delete(`/contracts/${contractId}/renewal-notices/${noticeId}`);
};
