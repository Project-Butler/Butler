// Created: 2026-11-19 13:33
import axiosInstance from '../../axios/axiosInstance';

// 계약서 OCR(B팀, #168). 계약서 파일로 계약 등록 칸에 채울 값을 받는다. 저장하지 않는다.
// ownershipId: 계약할 호실의 내 소유 관계(권리자 인증 완료). file: JPG · PNG · PDF(Blob/File), 4MB · PDF 5쪽까지.
// 본문은 파일 원문 그대로 보내고 Content-Type에 파일 형식을 적는다.
// → { fields: { leaseType, deposit, monthlyRent, rentPaymentDay, startDate, endDate, tenantName, tenantPhone, memo }, memoTruncated, warnings: [{ field, code, message }] }
//   fields의 각 값은 계약서에서 근거를 찾은 것만 있고 나머지는 null. warnings의 field가 null이면 호실·임대인 대조 안내다.
// 400 CONTRACT_OCR_FILE_REQUIRED, 422 CONTRACT_OCR_UNSUPPORTED_FILE · _FILE_TOO_LARGE · _TOO_MANY_PAGES · _UNREADABLE,
// 503 CONTRACT_OCR_UNAVAILABLE, 429 RATE_LIMITED(하루 100회), 계약 등록과 같은 404 OWNERSHIP_NOT_FOUND · 422 OWNERSHIP_ENDED · 403 OWNERSHIP_VERIFICATION_REQUIRED
export const postContractOcr = async ({ ownershipId, file }) => {
  const { data } = await axiosInstance.post('/contract-ocr', file, {
    params: { ownershipId },
    headers: { 'Content-Type': file.type },
  });
  return data.data;
};
