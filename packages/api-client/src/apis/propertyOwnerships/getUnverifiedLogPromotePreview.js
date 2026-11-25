import axiosInstance from '../../axios/axiosInstance';

// 인증 전 기록 올리기 미리보기(H-44). 그 소유 관계의 인증된 활성 소유자만. 이미 처리했으면 count 0.
// 돌려주는 값: { count, items: [{ id, title, type, occurredOn }] }
export const getUnverifiedLogPromotePreview = async (ownershipId) => {
  const { data } = await axiosInstance.get(`/property-ownerships/${ownershipId}/management-logs/promote-preview`);
  return data.data;
};
