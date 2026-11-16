import axiosInstance from '../../axios/axiosInstance';

// 본인 확인(휴대폰 번호 뒤 4자리). 성공하면 서버가 확인 세션 쿠키를 내려준다(JS는 값을 보지 못한다).
// 실패 422 INVITATION_VERIFY_FAILED, 대기 429 INVITATION_VERIFY_RATE_LIMITED(retryAfterSeconds), 하루 한도 429 INVITATION_VERIFY_DAILY_LIMIT
export const postTenantInvitationVerify = async (token, { phoneLast4 }) => {
  const { data } = await axiosInstance.post(`/tenant-invitations/${encodeURIComponent(token)}/verify`, { phoneLast4 });
  return data.data;
};
