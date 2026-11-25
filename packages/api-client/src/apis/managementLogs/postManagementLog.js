import axiosInstance from '../../axios/axiosInstance';

// body: { type, keepPrivate?(메모의 [나만 보기]), room?(방 태그, null = 방 없음), title, content?, occurredOn, cost?, attachmentDocumentIds? }.
// 공개 범위는 서버가 정한다: 인증 전엔 모두 나만 보기, 인증 뒤 수리·점검은 호실 이력, 메모는 keepPrivate가 아니면 호실 이력.
// scope?는 보내지 않아도 된다(인증 소유자의 수리·점검 PRIVATE는 400 SCOPE_NOT_ALLOWED, 인증 전 PROPERTY_HISTORY는 403).
export const postManagementLog = async (propertyId, body) => {
  const { data } = await axiosInstance.post(`/properties/${propertyId}/management-logs`, body);
  return data.data;
};
