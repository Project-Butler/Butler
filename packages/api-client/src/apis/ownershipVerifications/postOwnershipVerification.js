import axiosInstance from '../../axios/axiosInstance';

// body: { ownershipId, consent: true, identityVerificationId, testMode? }. 이름·생년월일은 서버가 회원 정보에서 읽는다 → 202 { id, ownershipId, status, createdAt, finishedAt }
// identityVerificationId: 포트원 본인인증 ID(필수). 서버가 포트원에 직접 조회해 회원 정보와 비교한다. 한 번 쓴 ID는 다시 쓸 수 없다.
// testMode: [임시·시연용] true면 본인인증 인적사항 대조만 건너뛴다. 운영 배포 전 제거.
// status: 'PENDING' | 'RUNNING' | 'VERIFIED' | 'FAILED'. 진행 중 시도가 있으면 그 시도를 돌려준다.
// 503 VERIFICATION_RUNNER_UNAVAILABLE(준비 중), 422 VERIFICATION_REVOKED(문의 안내), 422 OWNERSHIP_VERIFICATION_BIRTH_DATE_REQUIRED(회원 생년월일 없음)
// 본인인증: 422 IDENTITY_VERIFICATION_NOT_VERIFIED(미완료) · _MISMATCH(인적사항 불일치) · _EXPIRED(10분 지남),
//   409 IDENTITY_VERIFICATION_ALREADY_USED(이미 쓴 ID), 503 IDENTITY_VERIFICATION_UNAVAILABLE(조회 실패). 모두 시도를 만들지 않는다.
export const postOwnershipVerification = async (body) => {
  const { data } = await axiosInstance.post('/ownership-verifications', body);
  return data.data;
};
