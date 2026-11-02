import axiosInstance from '../../axios/axiosInstance';

// body: { exclusiveArea?, floor? } — 인증된 소유자·ADMIN만 수정할 수 있다
export const patchProperty = async (propertyId, body) => {
  const { data } = await axiosInstance.patch(`/properties/${propertyId}`, body);
  return data.data;
};
