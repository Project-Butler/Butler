import axiosInstance from '../../axios/axiosInstance';

// body: { terminatedOn: 'YYYY-MM-DD'(오늘·종료일 이하), reason? }
export const postContractTermination = async (contractId, body) => {
  const { data } = await axiosInstance.post(`/contracts/${contractId}/terminate`, body);
  return data.data;
};
