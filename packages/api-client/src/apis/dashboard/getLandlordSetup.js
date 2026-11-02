import axiosInstance from '../../axios/axiosInstance';

// { progress, steps: [{ key, done, count, available?, locked? }], buildings: [{ id, name, propertyCount, capacity, remainingCount }] }
export const getLandlordSetup = async () => {
  const { data } = await axiosInstance.get('/dashboard/landlord/setup');
  return data.data;
};
