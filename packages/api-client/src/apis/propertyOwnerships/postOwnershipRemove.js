import axiosInstance from '../../axios/axiosInstance';

// 끝난 소유 관계를 목록에서 지운다(H-41). 바디 없음, 204(이미 지웠어도 204).
// 그 관계의 나만 보기 기록·첨부는 지워지고, 계약·서류는 남지만 목록·검색·서류함에서 빠진다. 활성 소유 관계는 422 OWNERSHIP_ACTIVE.
export const postOwnershipRemove = async (ownershipId) => {
  await axiosInstance.post(`/property-ownerships/${ownershipId}/remove`);
};
