// Created: 2026-11-19 14:25
import axiosInstance from '../../axios/axiosInstance';

// 내 진행 중(PENDING · RUNNING) 권리자 인증 시도 전부, 오래된 순 → [{ id, ownershipId, status, createdAt, finishedAt, property: { id, displayName } }]
// 화면 오른쪽 아래 진행 표시용. 끝난 시도는 목록에서 빠지므로, 결과는 getOwnershipVerification(attemptId)로 읽는다.
export const getInProgressOwnershipVerificationList = async () => {
  const { data } = await axiosInstance.get('/ownership-verifications/in-progress');
  return data.data;
};
