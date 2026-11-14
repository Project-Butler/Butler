// 공유 계약서 파일 구분·표기(공개 초대 화면 B3 · 임차인 계약서 E2 · 뷰어 B4).
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const isImageDocument = (document) => IMAGE_TYPES.has(document?.mimeType);
export const isPdfDocument = (document) => document?.mimeType === 'application/pdf';

// 사진이 아닌 파일(PDF 등)은 위에 줄로, 사진은 아래 3칸 격자로 보여 준다. 뷰어는 이 순서 그대로 한 줄로 넘긴다.
export const splitDocuments = (documents = []) => {
  const files = documents.filter((document) => !isImageDocument(document));
  const photos = documents.filter(isImageDocument);
  return { files, photos, ordered: [...files, ...photos] };
};

// 1234567 → '1.2MB', 2048 → '2KB'
export const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')}MB`;
};

// 파일 종류 짧은 표지(PDF 칸 글자)
export const getFileBadge = (document) => {
  if (isPdfDocument(document)) return 'PDF';
  const ext = document?.fileName?.split('.').pop();
  return ext && ext !== document?.fileName ? ext.slice(0, 4).toUpperCase() : 'FILE';
};
