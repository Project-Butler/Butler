import axiosInstance from '../../axios/axiosInstance';

export const patchPropertyVerification = async (propertyId, { status, verifiedBy, evidence }) => {
  const { data } = await axiosInstance.patch(`/api/properties/${propertyId}/verification`, {
    status,
    verifiedBy,
    evidence,
  });
  return data;
};
