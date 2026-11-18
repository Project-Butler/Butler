import axiosInstance from '../../axios/axiosInstance';

// 호실 하나의 서류함(내 소유 서류 + 계약별 서류). 호출 한 번에 모두 받는다(페이지 없음).
// 응답 { property, documentCount, ownerships: [{ ..., isUploadable, documents }], contracts: [{ ..., status, isUploadable, documents }] }
// 에러: 403 FORBIDDEN_ROLE(임대인만), 404 PROPERTY_NOT_FOUND(그 호실에 내 소유 관계가 없음)
export const getPropertyDocumentBox = async (propertyId) => {
  const { data } = await axiosInstance.get(`/properties/${propertyId}/documents`);
  return data.data;
};
