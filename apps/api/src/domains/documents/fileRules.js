// 파일·문서 규칙(DB 의존 없음). 계약 6장 "파일 · 문서".
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 255;
// 관리 로그 한 건에 붙일 수 있는 문서 수(계약 5장)
export const MAX_LOG_ATTACHMENTS = 10;
// 티켓 첨부 최대 10개(계약 5장)
export const MAX_TICKET_ATTACHMENTS = 10;

export const DOCUMENT_TYPES = ['CONTRACT_DOCUMENT', 'REGISTRY_CERTIFICATE', 'PHOTO', 'OTHER'];
// 다운로드 URL 발급을 감사 로그에 남기는 문서 유형(계약 10장 DOCUMENT_DOWNLOAD_URL_ISSUED)
export const AUDITED_DOWNLOAD_TYPES = ['CONTRACT_DOCUMENT', 'REGISTRY_CERTIFICATE'];
// 계약 6장의 resourceType 목록. 권한 확인은 resourcePolicies.js에 구현된 것만 받는다.
export const DOCUMENT_RESOURCE_TYPES = ['PROPERTY', 'OWNERSHIP', 'CONTRACT', 'TICKET', 'MANAGEMENT_LOG', 'THREAD_MESSAGE'];

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

// HEIF 계열 ftyp brand. HEIC는 변환하지 않고 그대로 받는다(결정 Q3).
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

// 형식별 파일 앞부분(매직 바이트) 검사. 확장자·브라우저가 보낸 형식은 믿지 않는다.
const SIGNATURES = {
  'image/jpeg': (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  'image/png': (buffer) => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (buffer) => startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8),
  'image/heic': (buffer) => startsWith(buffer, ascii('ftyp'), 4) && HEIF_BRANDS.has(buffer.subarray(8, 12).toString('latin1')),
  'application/pdf': (buffer) => startsWith(buffer, ascii('%PDF-')),
};
SIGNATURES['image/heif'] = SIGNATURES['image/heic'];

export const ALLOWED_MIME_TYPES = Object.keys(SIGNATURES);

export const isAllowedMimeType = (mimeType) => ALLOWED_MIME_TYPES.includes(mimeType);

// 선언한 형식과 파일 앞부분이 맞는지
export const matchesDeclaredType = (buffer, mimeType) => Boolean(SIGNATURES[mimeType]?.(buffer));

// 매직 바이트 검사에 필요한 앞부분 길이
export const SIGNATURE_PEEK_BYTES = 16;

// 저장 경로는 업로드 id로만 만든다(원본 파일 이름을 쓰지 않아 경로 조작을 막는다).
// 모든 저장소 드라이버가 같은 경로를 쓴다(local은 폴더 안 경로, supabase는 버킷 안 객체 이름).
export const toStoragePath = (uploadId) => `uploads/${uploadId}`;

// toStoragePath()가 만드는 모양만 받는다(경로 조작 방지). 드라이버가 파일을 다루기 전에 확인한다.
const STORAGE_PATH_PATTERN = /^uploads\/[0-9a-f-]{36}$/;
export const isStoragePath = (storagePath) => typeof storagePath === 'string' && STORAGE_PATH_PATTERN.test(storagePath);
