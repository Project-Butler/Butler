import axiosInstance from '../../axios/axiosInstance';

// body: { complexId, buildingNo?, unitNo, exclusiveArea?, floor?, acquiredYearMonth?, purchasePrice?, unitType?, equipment?, equipmentEtc? }
export const postProperty = async (body) => {
  const { data } = await axiosInstance.post('/properties', body);
  return data.data;
};
