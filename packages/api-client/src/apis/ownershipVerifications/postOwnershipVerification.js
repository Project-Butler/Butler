import axiosInstance from '../../axios/axiosInstance';

// body: { ownershipId, consent: true }. 이름·생년월일은 서버가 회원 정보에서 읽는다 → 202 { id, ownershipId, status, createdAt, finishedAt }
// status: 'PENDING' | 'RUNNING' | 'VERIFIED' | 'FAILED'. 진행 중 시도가 있으면 그 시도를 돌려준다.
// 503 VERIFICATION_RUNNER_UNAVAILABLE(준비 중), 422 VERIFICATION_REVOKED(문의 안내), 422 OWNERSHIP_VERIFICATION_BIRTH_DATE_REQUIRED(회원 생년월일 없음)
export const postOwnershipVerification = async (body) => {
  const { data } = await axiosInstance.post('/ownership-verifications', body);
  return data.data;
};
