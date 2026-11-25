import axiosInstance from '../../axios/axiosInstance';

// 인증 전 기록을 호실 이력으로 올린다(H-44). body: { skip?: true(나만 보기로 두기) }. 소유 관계당 한 번(두 번째는 409 ALREADY_PROMOTED).
// 돌려주는 값: { promotedCount }
export const postUnverifiedLogPromote = async (ownershipId, body = {}) => {
  const { data } = await axiosInstance.post(`/property-ownerships/${ownershipId}/management-logs/promote`, body);
  return data.data;
};
