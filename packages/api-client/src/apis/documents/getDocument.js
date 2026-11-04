import axiosInstance from '../../axios/axiosInstance';

export const getDocument = async (documentId) => {
  const { data } = await axiosInstance.get(`/documents/${documentId}`);
  return data.data;
};
