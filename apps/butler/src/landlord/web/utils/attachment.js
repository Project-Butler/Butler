// 사진·문서 첨부 공통 값·검사(계약 6장). 서버(apps/api documents/fileRules.js)와 같은 범위다.
// 여기 검사는 미리 알려 주는 용도이고, 실제 형식은 서버가 파일 앞부분으로 다시 확인한다.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_LOG_ATTACHMENTS = 10;

// 브라우저가 형식을 비워 보내는 경우(Windows의 HEIC 등)는 확장자로 고른다.
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};
const ALLOWED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));
// 브라우저가 바로 그릴 수 있는 사진. HEIC는 변환하지 않으므로 다운로드 링크로 보여 준다.
const RENDERABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const ATTACHMENT_ACCEPT = [...ALLOWED_MIME_TYPES, ...Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`)].join(',');

export const resolveFileMimeType = (file) => {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
};

// 올릴 수 없는 파일이면 안내 문구, 올릴 수 있으면 null
export const checkAttachmentFile = (file) => {
  if (!resolveFileMimeType(file)) return `${file.name}: JPEG·PNG·WEBP·HEIC 사진과 PDF만 올릴 수 있어요.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: 한 파일은 20MB까지 올릴 수 있어요.`;
  if (file.size === 0) return `${file.name}: 빈 파일은 올릴 수 없어요.`;
  return null;
};

export const isRenderableImage = (mimeType) => RENDERABLE_IMAGE_TYPES.has(mimeType);

export const toDocumentType = (mimeType) => (mimeType === 'application/pdf' ? 'OTHER' : 'PHOTO');

// 목록·홈에서는 썸네일 없이 개수만
export const formatAttachmentCount = (attachments) => (attachments?.length ? `사진 ${attachments.length}장` : null);

// 1536000 → '1.5MB'
export const formatFileSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
