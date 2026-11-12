import axiosInstance from '../../axios/axiosInstance';

// body: { propertyId, category('REPAIR'|'INSPECTION'|'OTHER'), title, description, attachmentDocumentIds? }
// 사진은 먼저 postDocument로 미연결 문서를 만들고 그 id를 넘긴다.
export const postTicket = async (body) => {
  const { data } = await axiosInstance.post('/tickets', body);
  return data.data;
};
