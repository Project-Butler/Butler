// 사진·문서·동영상 첨부 공통 값·검사(계약 6장). 규칙은 서버(GET /files/upload-rules, apps/api platform/uploadRules.js)가 정하고,
// 받지 못했을 때는 아래 기본값(사진·PDF 20MB, 동영상은 어디에도 안 붙음)을 쓴다.
// 여기 검사는 미리 알려 주는 용도이고, 실제 형식은 서버가 파일 앞부분으로 다시 확인한다.
const MB = 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 20 * MB;
export const MAX_LOG_ATTACHMENTS = 10;

// 서버 규칙을 받기 전(또는 받지 못했을 때)의 값. resourceKinds가 비어 있으니 모든 곳이 사진·PDF만 받는다.
export const DEFAULT_UPLOAD_RULES = {
  kinds: {
    IMAGE: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], maxBytes: 20 * MB },
    PDF: { mimeTypes: ['application/pdf'], extensions: ['pdf'], maxBytes: 20 * MB },
    VIDEO: { mimeTypes: ['video/mp4', 'video/quicktime'], extensions: ['mp4', 'mov', 'm4v'], maxBytes: 50 * MB },
  },
  resourceKinds: {},
  uploadSessionTtlMs: { IMAGE: 15 * 60 * 1000, PDF: 15 * 60 * 1000, VIDEO: 30 * 60 * 1000 },
  viewUrlTtlMs: { IMAGE: 5 * 60 * 1000, PDF: 5 * 60 * 1000, VIDEO: 60 * 60 * 1000 },
};
export const DEFAULT_FILE_KINDS = ['IMAGE', 'PDF'];

const KIND_LABELS = { IMAGE: 'JPEG·PNG·WEBP·HEIC 사진', PDF: 'PDF', VIDEO: 'MP4·MOV 동영상' };

// 브라우저가 형식을 비워 보내는 경우(Windows의 HEIC 등)는 확장자로 고른다.
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
};
const KNOWN_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));
// 브라우저가 바로 그릴 수 있는 사진. HEIC는 변환하지 않으므로 다운로드 링크로 보여 준다.
const RENDERABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const isVideoMimeType = (mimeType) => typeof mimeType === 'string' && mimeType.startsWith('video/');

export const kindOfMimeType = (mimeType) => {
  if (typeof mimeType !== 'string') return null;
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (isVideoMimeType(mimeType)) return 'VIDEO';
  return null;
};

// 그 곳(resourceType)이 받는 묶음. resourceType이 없거나 규칙에 없으면 사진·PDF.
export const allowedFileKinds = (rules = DEFAULT_UPLOAD_RULES, resourceType) =>
  (resourceType && rules?.resourceKinds?.[resourceType]) || DEFAULT_FILE_KINDS;

const kindRules = (rules, kind) => rules?.kinds?.[kind] ?? DEFAULT_UPLOAD_RULES.kinds[kind];

// <input accept>. 형식과 확장자를 함께 준다(형식을 모르는 브라우저 대비).
export const buildAttachmentAccept = (rules = DEFAULT_UPLOAD_RULES, kinds = DEFAULT_FILE_KINDS) =>
  kinds.flatMap((kind) => [...kindRules(rules, kind).mimeTypes, ...kindRules(rules, kind).extensions.map((ext) => `.${ext}`)]).join(',');

export const ATTACHMENT_ACCEPT = buildAttachmentAccept();

export const resolveFileMimeType = (file) => {
  if (KNOWN_MIME_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
};

const toMb = (bytes) => Math.round(bytes / MB);

const describeKinds = (kinds) => {
  const labels = kinds.map((kind) => KIND_LABELS[kind]);
  if (labels.length === 1) return `${labels[0]}만`;
  if (labels.length === 2) return `${labels[0]}과 ${labels[1]}만`;
  return `${labels.slice(0, -1).join(', ')}, ${labels.at(-1)}만`;
};

// 올릴 수 없는 파일이면 안내 문구, 올릴 수 있으면 null. kinds를 빼면 사진·PDF만 받는다(지금까지와 같음).
export const checkAttachmentFile = (file, { rules = DEFAULT_UPLOAD_RULES, kinds = DEFAULT_FILE_KINDS } = {}) => {
  const kind = kindOfMimeType(resolveFileMimeType(file));
  if (!kind || !kinds.includes(kind)) return `${file.name}: ${describeKinds(kinds)} 올릴 수 있어요.`;
  const maxBytes = kindRules(rules, kind).maxBytes;
  if (file.size > maxBytes) {
    return kind === 'VIDEO'
      ? `${file.name}: 동영상은 ${toMb(maxBytes)}MB까지 올릴 수 있어요.`
      : `${file.name}: 한 파일은 ${toMb(maxBytes)}MB까지 올릴 수 있어요.`;
  }
  if (file.size === 0) return `${file.name}: 빈 파일은 올릴 수 없어요.`;
  return null;
};

// 고르는 칸 아래 안내. 동영상을 받는 곳만 동영상 한도를 따로 말한다.
export const describeAttachmentLimits = (rules = DEFAULT_UPLOAD_RULES, kinds = DEFAULT_FILE_KINDS, { verb = '붙일' } = {}) => {
  const documentKinds = kinds.filter((kind) => kind !== 'VIDEO');
  const documentMb = toMb(Math.max(...documentKinds.map((kind) => kindRules(rules, kind).maxBytes)));
  const documentPart = documentKinds.map((kind) => KIND_LABELS[kind]).join('과 ');
  if (!kinds.includes('VIDEO')) return `${documentPart}, 한 파일 ${documentMb}MB까지 ${verb} 수 있어요.`;
  return `${documentPart}는 ${documentMb}MB, ${KIND_LABELS.VIDEO}은 ${toMb(kindRules(rules, 'VIDEO').maxBytes)}MB까지 ${verb} 수 있어요.`;
};

// 문서함 파일 칸 안내: 'PDF·JPG·PNG·WEBP·HEIC 20MB까지' / 동영상을 받으면 'PDF·JPG·PNG·WEBP·HEIC 20MB, MP4·MOV 50MB까지'
export const describeDocumentBoxFileLimits = (rules = DEFAULT_UPLOAD_RULES, kinds = DEFAULT_FILE_KINDS) => {
  const documentMb = toMb(Math.max(kindRules(rules, 'IMAGE').maxBytes, kindRules(rules, 'PDF').maxBytes));
  if (!kinds.includes('VIDEO')) return `PDF·JPG·PNG·WEBP·HEIC ${documentMb}MB까지`;
  return `PDF·JPG·PNG·WEBP·HEIC ${documentMb}MB, MP4·MOV ${toMb(kindRules(rules, 'VIDEO').maxBytes)}MB까지`;
};

export const isRenderableImage = (mimeType) => RENDERABLE_IMAGE_TYPES.has(mimeType);

// 수리 요청·하우스 로그 첨부의 문서 종류. 동영상도 현장 기록이라 사진(PHOTO)으로 둔다.
export const toDocumentType = (mimeType) => (mimeType === 'application/pdf' ? 'OTHER' : 'PHOTO');

// 목록·홈에서는 썸네일 없이 개수만. 동영상이 섞이면 '첨부 n개'.
export const formatAttachmentCount = (attachments) => {
  if (!attachments?.length) return null;
  return attachments.some((attachment) => isVideoMimeType(attachment?.mimeType)) ? `첨부 ${attachments.length}개` : `사진 ${attachments.length}장`;
};

// 1536000 → '1.5MB'
export const formatFileSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
