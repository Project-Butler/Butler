import axiosInstance from '../../axios/axiosInstance';

// body: { contextType('CONTRACT'|'TICKET'), contextId }. 이미 있으면 그 스레드를 돌려준다(멱등).
export const postThread = async (body) => {
  const { data } = await axiosInstance.post('/threads', body);
  return data.data;
};
