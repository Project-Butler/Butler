// 문서함(임대인 웹) 표기·판단 도우미. docs/10. 유지보수 요청·문서 개발/문서함 개발 계획.md 3-1·4-2·4-3.
// 숫자·날짜는 쓰는 쪽에서 font-num tabular-nums로 감싼다.
import { MAX_ATTACHMENT_BYTES } from '../../../shared/upload/attachment';
import { formatUnitLabel } from './unitAddress';

export const OWNERSHIP_TARGET = 'OWNERSHIP';
export const CONTRACT_TARGET = 'CONTRACT';

// 리소스당 문서 상한(서버 ownershipDocumentPolicy·contractDocumentPolicy의 maxAttachments)과 한 번에 올리는 파일 수
export const MAX_DOCUMENTS_PER_TARGET = 30;
export const MAX_FILES_PER_BATCH = 10;
export const MAX_FILE_SIZE_TEXT = `${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB`;

// documentType → 화면 라벨. 서버 apps/api documents/fileRules.js DOCUMENT_TYPES 전체를 덮는다.
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

// 보관할 곳별 고를 수 있는 종류(칩 순서). 서버 fileRules.js OWNERSHIP_DOCUMENT_TYPES·CONTRACT_DOCUMENT_TYPES와 같은 값이다.
export const DOCUMENT_TYPES_BY_TARGET = {
  [OWNERSHIP_TARGET]: ['REGISTRY_CERTIFICATE', 'SALE_CONTRACT', 'INSURANCE', 'OTHER'],
  [CONTRACT_TARGET]: ['CONTRACT_DOCUMENT', 'LEASE_REPORT', 'RECEIPT', 'MOVE_PHOTO', 'OTHER'],
};

export const TARGET_LABELS = {
  [OWNERSHIP_TARGET]: '내 소유 문서',
  [CONTRACT_TARGET]: '계약 문서',
};

// 남은 자리(30 − 지금 수). 한 번에 고를 수 있는 파일 수는 남은 자리와 한 번에 최대(10) 중 작은 쪽이다.
export const getRemainingSlots = (currentCount) => Math.max(0, MAX_DOCUMENTS_PER_TARGET - (currentCount ?? 0));
export const getSelectableFileCount = (currentCount, queuedCount = 0) =>
  Math.max(0, Math.min(MAX_FILES_PER_BATCH, getRemainingSlots(currentCount)) - queuedCount);

const IN_PROGRESS_STATUSES = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON'];
// 지금 진행 중인 계약(시작 전·진행 중·만료 임박이고 소유 관계가 활성). 아니면 '지난 계약' 묶음으로 간다.
export const isCurrentContract = (contract) => IN_PROGRESS_STATUSES.includes(contract.status) && contract.isOwnershipActive !== false;

// 서버가 이미 정렬해 주므로 순서는 그대로 두고 나눈다.
export const splitContracts = (contracts) => ({
  current: contracts.filter(isCurrentContract),
  past: contracts.filter((contract) => !isCurrentContract(contract)),
});

// 내 소유 관계: 첫 번째(활성 또는 가장 최근)가 '내 소유 문서', 나머지는 접힌 '지난 소유 기간'
export const splitOwnerships = (ownerships) => ({ primary: ownerships[0] ?? null, past: ownerships.slice(1) });

const CONTRACT_STATUS_BADGE = {
  UPCOMING: { tone: 'default', label: '시작 전' },
  ACTIVE: { tone: 'success', label: '진행 중' },
  EXPIRING_SOON: { tone: 'warning', label: '만료 임박' },
  EXPIRED: { tone: 'default', label: '만료' },
  TERMINATED: { tone: 'default', label: '해지' },
};

// 소유가 끝난 계약은 날짜상 진행 중이어도 임대인에게는 끝난 계약이다.
export const getContractGroupBadge = (contract) =>
  contract.isOwnershipActive === false && IN_PROGRESS_STATUSES.includes(contract.status)
    ? { tone: 'default', label: '소유 종료' }
    : (CONTRACT_STATUS_BADGE[contract.status] ?? { tone: 'default', label: contract.status });

// '2025-03-02' ~ '2027-02-28' → '2025.03.02 ~ 2027.02.28'
export const formatContractPeriod = (startDate, endDate) => `${startDate.replaceAll('-', '.')} ~ ${endDate.replaceAll('-', '.')}`;

// 팝업 계약 선택 칸 문구. 끝난 계약은 "(만료)"·"(해지)"를 붙인다.
export const formatContractOption = (contract) => {
  const suffix = contract.status === 'EXPIRED' ? ' (만료)' : contract.status === 'TERMINATED' ? ' (해지)' : '';
  return `${contract.tenantName} · ${formatContractPeriod(contract.startDate, contract.endDate)}${suffix}`;
};

// 올리기 팝업에서 계약 문서를 올릴 수 있는 계약(내 소유 관계의 계약 전부 — 2026-11-20부터 소유 종료와 무관). 기본은 진행 중 계약, 없으면 가장 최근(서버 정렬 첫 번째).
export const getUploadableContracts = (contracts) => contracts.filter((contract) => contract.isUploadable);
export const pickDefaultContract = (contracts) => {
  const uploadable = getUploadableContracts(contracts);
  return uploadable.find(isCurrentContract) ?? uploadable[0] ?? null;
};

// 올리기 팝업·호실 상세에서 보여 줄 올릴 곳 요약. 내 소유 관계(활성·종료)와 그 계약이면 소유 종료·인증과 관계없이 된다(2026-11-20).
export const getUploadTargets = (box) => {
  const { primary } = splitOwnerships(box?.ownerships ?? []);
  return {
    ownership: primary?.isUploadable ? primary : null,
    contracts: getUploadableContracts(box?.contracts ?? []),
  };
};

export const hasUploadTarget = (box) => {
  const targets = getUploadTargets(box);
  return Boolean(targets.ownership) || targets.contracts.length > 0;
};

// 문서를 지울 수 있는지: 올린 본인이고 잠기지 않은 내 소유·계약 문서면 항상(소유 종료·계약 만료·임차인 공유와 무관, 2026-11-20).
export const canDeleteDocument = (document, { userId } = {}) =>
  Boolean(userId) &&
  document.uploaderId === userId &&
  !document.isLocked &&
  [OWNERSHIP_TARGET, CONTRACT_TARGET].includes(document.resourceType);

// 왼쪽 호실 줄 보조 문구: { count(숫자 글꼴로 그릴 문서 수, 없으면 null), text }
//  - 예전 호실: 문서 n · 소유 종료
//  - 문서가 있으면: 문서 n · 계약 중/계약 대기/공실
//  - 문서가 없으면: 인증된 호실은 올리기 안내, 미인증·만료 호실은 인증 안내(D-C). 계약 문서는 인증 없이도 올릴 수 있어 "내 소유 문서"로 범위를 밝힌다
const PROPERTY_STATE_TEXT = { LEASED: '계약 중', CONTRACT_PENDING: '계약 대기', VACANT: '공실' };

// 좁은 목록의 호실 이름: 동·호(구별 정보, 자르지 않음)와 단지명(말줄임)을 나눈다.
// 같은 단지의 호실이 여럿이면 '단지명 101동 100…'처럼 잘려 서로 같아 보이기 때문. 동·호가 없으면 displayName 그대로.
export const splitPropertyName = (property) => {
  if (!property?.unitNo) return { unitLabel: property?.displayName ?? '', complexName: null };
  return { unitLabel: formatUnitLabel(property.buildingNo ?? '', property.unitNo), complexName: property.complex?.name ?? null };
};

export const describePropertyRow = (property, { isFormer = false } = {}) => {
  const count = property.documentCount ?? 0;
  if (isFormer) return { count, text: '소유 종료' };
  if (count > 0) return { count, text: PROPERTY_STATE_TEXT[property.status] ?? PROPERTY_STATE_TEXT.VACANT };
  return { count: null, text: '문서 없음 · 계약서를 올려 두세요' };
};

// 호실 상세 문서함 카드 한 칸 요약: { count, recent(최근 올린 순 limit개), rest(나머지 수) }
// groups: 소유 관계들 또는 계약들(각각 documents를 가짐). 서버가 묶음 안을 최근 순으로 주지만 묶음이 여럿일 수 있어 다시 정렬한다.
export const summarizeDocuments = (groups, limit = 2) => {
  const all = groups.flatMap((group) => group.documents ?? []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { count: all.length, recent: all.slice(0, limit), rest: Math.max(0, all.length - limit) };
};
