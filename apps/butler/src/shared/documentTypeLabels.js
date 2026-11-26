// documentType → 화면 라벨. 서버 apps/api documents/fileRules.js DOCUMENT_TYPES 전체를 덮는다.
// 임대인 문서함과 관리자 문서 목록이 같이 쓴다(역할 폴더끼리는 import할 수 없어서 shared에 둔다).
export const DOCUMENT_TYPE_LABELS = {
  REGISTRY_CERTIFICATE: '등기부',
  SALE_CONTRACT: '매매계약서',
  INSURANCE: '보험',
  CONTRACT_DOCUMENT: '계약서·특약',
  LEASE_REPORT: '신고필증·확정일자',
  RECEIPT: '영수증',
  MOVE_PHOTO: '입주·퇴거 사진',
  PHOTO: '사진',
  OTHER: '기타',
};

export const getDocumentTypeLabel = (documentType) => DOCUMENT_TYPE_LABELS[documentType] ?? DOCUMENT_TYPE_LABELS.OTHER;
