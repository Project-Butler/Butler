import axiosInstance from '../../axios/axiosInstance';

// body: { acquiredYearMonth?, purchasePrice?, unitType?, equipment?, equipmentEtc? }
export const patchPropertyOwnership = async (ownershipId, body) => {
  const { data } = await axiosInstance.patch(`/property-ownerships/${ownershipId}`, body);
  return data.data;
};
