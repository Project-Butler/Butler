import axiosInstance from '../../axios/axiosInstance';

// body: { ownershipId, birthDate: 'YYYY-MM-DD', consent: true } → 202 { id, ownershipId, status, createdAt, finishedAt }
// status: 'PENDING' | 'RUNNING' | 'VERIFIED' | 'FAILED'. 진행 중 시도가 있으면 그 시도를 돌려준다.
// 503 VERIFICATION_RUNNER_UNAVAILABLE(준비 중), 422 VERIFICATION_REVOKED(문의 안내)
export const postOwnershipVerification = async (body) => {
  const { data } = await axiosInstance.post('/ownership-verifications', body);
  return data.data;
};
