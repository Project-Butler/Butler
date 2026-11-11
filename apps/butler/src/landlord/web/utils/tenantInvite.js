// 임차인 초대(#109) 화면 값. 한도 숫자(MAX_SHARED_DOCUMENTS)는 A2c 팝업 문구 말고는 화면에 적지 않는다(결정 13).
import { formatDateKST } from './format';
import { toPhoneDigits } from './contract';

// 한 초대에 함께 보여 줄 수 있는 계약서 수(서버 A-06과 같은 값)
export const MAX_SHARED_DOCUMENTS = 10;

// 계약 서류함(GET /documents, resourceType CONTRACT)은 계약 하나에 30개까지라 한 번에 다 불러온다.
export const CONTRACT_DOCUMENT_PAGE_SIZE = 30;

// 계약서로 올릴 수 있는 형식(결정 10: PDF·JPG·PNG, HEIC는 우선 아님)
const CONTRACT_MIME_BY_EXTENSION = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const CONTRACT_MIME_TYPES = new Set(Object.values(CONTRACT_MIME_BY_EXTENSION));
export const CONTRACT_FILE_ACCEPT = [...CONTRACT_MIME_TYPES, ...Object.keys(CONTRACT_MIME_BY_EXTENSION).map((ext) => `.${ext}`)].join(',');
export const CONTRACT_PHOTO_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';
const MAX_CONTRACT_FILE_BYTES = 20 * 1024 * 1024;

export const resolveContractFileMimeType = (file) => {
  if (CONTRACT_MIME_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return CONTRACT_MIME_BY_EXTENSION[extension] ?? null;
};

// 올릴 수 없는 파일이면 안내 문구, 올릴 수 있으면 null
export const checkContractFile = (file) => {
  if (!resolveContractFileMimeType(file)) return `${file.name}: PDF 또는 사진(JPG·PNG)만 올릴 수 있어요.`;
  if (file.size > MAX_CONTRACT_FILE_BYTES) return `${file.name}: 한 파일은 20MB까지 올릴 수 있어요.`;
  if (file.size === 0) return `${file.name}: 빈 파일은 올릴 수 없어요.`;
  return null;
};

// 사진은 격자, 그 밖(PDF)은 한 줄씩. 사진은 묶지 않고 파일 하나씩 다룬다(결정 10).
export const isContractPhoto = (mimeType) => mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';

// '01012344444' → '010-****-4444', '0101234567' → '010-***-4567'. 자리가 모자라면 그대로 숨긴다.
export const maskPhone = (value) => {
  const digits = toPhoneDigits(value);
  if (digits.length < 10) return digits ? '010-****-****' : '';
  const middle = digits.length === 11 ? 4 : 3;
  return `${digits.slice(0, 3)}-${'*'.repeat(middle)}-${digits.slice(3 + middle)}`;
};

// ISO 시각 → KST 'YYYY.MM.DD' / 'MM.DD'
export const formatDotDate = (isoString) => (isoString ? formatDateKST(isoString).replaceAll('-', '.') : null);
export const formatMonthDay = (isoString) => (isoString ? formatDotDate(isoString).slice(5) : null);

// 고른 파일 켜고 끄기. 한도를 넘기는 선택은 받지 않고 exceeded로 알린다(A2c, 그 파일은 선택되지 않는다).
export const toggleSharedDocument = (selectedIds, documentId, max = MAX_SHARED_DOCUMENTS) => {
  if (selectedIds.includes(documentId)) return { selectedIds: selectedIds.filter((id) => id !== documentId), exceeded: false };
  if (selectedIds.length >= max) return { selectedIds, exceeded: true };
  return { selectedIds: [...selectedIds, documentId], exceeded: false };
};

// 새로 올린 파일은 바로 선택한다. 자리가 없으면 선택하지 않고 exceeded.
export const selectUploadedDocument = (selectedIds, documentId, max = MAX_SHARED_DOCUMENTS) => {
  if (selectedIds.includes(documentId)) return { selectedIds, exceeded: false };
  return toggleSharedDocument(selectedIds, documentId, max);
};

// 호실 상세 계약 영역의 초대 상태 칩(A4). invitationStatus: 계약 응답 tenant.invitationStatus.
// latestInvitation: GET /contracts/:id/tenant-invitations 의 첫 행(최신). 만료일·실패 알림에만 쓴다.
// action: reissue(링크 다시 만들기) · renew(새 링크 만들기) · invite(임차인 초대) · null(버튼 없음)
export const getInvitationChip = (invitationStatus, latestInvitation) => {
  switch (invitationStatus) {
    case 'PENDING': {
      const monthDay = formatMonthDay(latestInvitation?.expiresAt);
      return { kind: 'PENDING', tone: 'warning', label: monthDay ? `초대 대기 · ${monthDay} 만료` : '초대 대기', action: 'reissue' };
    }
    case 'EXPIRED':
      return { kind: 'EXPIRED', tone: 'default', label: '링크 만료', action: 'renew' };
    case 'ACCEPTED':
      return { kind: 'ACCEPTED', tone: 'success', label: '앱 연결됨', action: null };
    default:
      // 초대 전(null)이나 취소된 초대(CANCELED)는 처음부터 초대한다.
      return { kind: 'NONE', tone: null, label: null, action: 'invite' };
  }
};

// 앱 계정 이름이 계약의 임차인 이름과 다른지(결정 9: 달라도 연결은 된다). 공백은 무시한다.
export const isAccountNameDifferent = (accountName, tenantName) =>
  Boolean(accountName && tenantName) && accountName.replace(/\s/g, '') !== tenantName.replace(/\s/g, '');

// 본인 확인이 하루 한도에 닿아 임대인에게 알렸는지(결정 14). 서버가 최신 초대에 landlordAlertedAt을 주면 켜진다.
export const hasVerifyFailureAlert = (invitationStatus, latestInvitation) =>
  invitationStatus === 'PENDING' && Boolean(latestInvitation?.landlordAlertedAt);

// 미리보기(A2b)에서 넘겨 볼 파일: 고른 파일을 화면 순서대로, 없으면 전부
export const toPreviewDocuments = (documents, selectedIds) => {
  const selected = documents.filter((document) => selectedIds.includes(document.id));
  return selected.length > 0 ? selected : documents;
};
