// 파일·문서 규칙(DB 의존 없음). 계약 6장 "파일 · 문서".
import { assertAllowedBody, throwIfInvalid } from '../../platform/requestValidation.js';

export const MAX_FILE_NAME_LENGTH = 255;
// 관리 로그 한 건에 붙일 수 있는 문서 수(계약 5장)
export const MAX_LOG_ATTACHMENTS = 10;
// 티켓 첨부 최대 10개(계약 5장)
export const MAX_TICKET_ATTACHMENTS = 10;

export const DOCUMENT_TYPES = [
  'CONTRACT_DOCUMENT',
  'REGISTRY_CERTIFICATE',
  'PHOTO',
  'OTHER',
  'SALE_CONTRACT',
  'INSURANCE',
  'LEASE_REPORT',
  'RECEIPT',
  'MOVE_PHOTO',
];
// 서류함에서 보관할 곳별 허용 종류(화면 칩과 1:1). 둘 다 DOCUMENT_TYPES의 부분집합.
export const OWNERSHIP_DOCUMENT_TYPES = ['REGISTRY_CERTIFICATE', 'SALE_CONTRACT', 'INSURANCE', 'OTHER'];
export const CONTRACT_DOCUMENT_TYPES = ['CONTRACT_DOCUMENT', 'LEASE_REPORT', 'RECEIPT', 'MOVE_PHOTO', 'OTHER'];
// 다운로드 URL 발급을 감사 로그에 남기는 문서 유형(계약 10장 DOCUMENT_DOWNLOAD_URL_ISSUED)
export const AUDITED_DOWNLOAD_TYPES = ['CONTRACT_DOCUMENT', 'REGISTRY_CERTIFICATE'];
// 서류함에 들어가는 리소스에 붙은 문서는 종류와 상관없이 감사한다.
export const AUDITED_DOWNLOAD_RESOURCE_TYPES = ['OWNERSHIP', 'CONTRACT'];
// 다운로드 주소를 받는 목적. VIEW(기본): 문서를 열기·크게 보기·저장. THUMBNAIL: 목록의 사진 썸네일.
export const DOWNLOAD_PURPOSES = ['VIEW', 'THUMBNAIL'];
// document: { type, resourceType, mimeType }(Prisma Document 행 또는 같은 모양)
// 사진의 썸네일 주소는 감사하지 않는다(문서를 연 것이 아니라 목록을 본 것). 사진이 아닌 문서는 썸네일이라 해도 감사한다.
export const isAuditedDownload = ({ type, resourceType, mimeType }, { purpose = 'VIEW' } = {}) => {
  if (purpose === 'THUMBNAIL' && typeof mimeType === 'string' && mimeType.startsWith('image/')) return false;
  return AUDITED_DOWNLOAD_TYPES.includes(type) || AUDITED_DOWNLOAD_RESOURCE_TYPES.includes(resourceType);
};
// POST …/download-url 바디: 없거나 {}면 VIEW, { purpose }만 받는다.
export const parseDownloadUrlBody = (body) => {
  const value = body ?? {};
  assertAllowedBody(value, ['purpose']);
  if (value.purpose === undefined) return { purpose: 'VIEW' };
  throwIfInvalid(DOWNLOAD_PURPOSES.includes(value.purpose) ? [] : [{ field: 'purpose', reason: 'VIEW 또는 THUMBNAIL이어야 합니다.' }]);
  return { purpose: value.purpose };
};
// 계약 6장의 resourceType 목록. 권한 확인은 resourcePolicies.js에 구현된 것만 받는다.
export const DOCUMENT_RESOURCE_TYPES = ['PROPERTY', 'OWNERSHIP', 'CONTRACT', 'TICKET', 'MANAGEMENT_LOG', 'THREAD_MESSAGE'];

// 형식·크기·파일 앞부분 검사는 platform/uploadRules.js 한 곳에 있다(관리 로그·티켓 등 platform 함수도 같은 표를 본다).
export { matchesDeclaredType, SIGNATURE_PEEK_BYTES } from '../../platform/uploadRules.js';

// 저장 경로는 업로드 id로만 만든다(원본 파일 이름을 쓰지 않아 경로 조작을 막는다).
// 모든 저장소 드라이버가 같은 경로를 쓴다(local은 폴더 안 경로, supabase는 버킷 안 객체 이름).
export const toStoragePath = (uploadId) => `uploads/${uploadId}`;

// toStoragePath()가 만드는 모양만 받는다(경로 조작 방지). 드라이버가 파일을 다루기 전에 확인한다.
const STORAGE_PATH_PATTERN = /^uploads\/[0-9a-f-]{36}$/;
export const isStoragePath = (storagePath) => typeof storagePath === 'string' && STORAGE_PATH_PATTERN.test(storagePath);
