import { formatBytes } from '../../../shared/documentViewer/documentFiles';
import { formatDateKST } from '../../web/utils/format';
import { getDocumentTypeLabel } from '../../web/utils/documentBox';

// 임대인 앱 문서함(M11) 표기·판단 도우미. 호실 하나의 문서함 응답(GET /properties/:propertyId/documents)을 화면 모양으로 바꾼다.

// 종류 카드 4칸. documentType 을 화면 묶음으로 모은다(서버 fileRules.js DOCUMENT_TYPES 기준).
// 보험(INSURANCE)·기타(OTHER)는 어느 칸에도 넣지 않고 [전체]에서만 보인다.
export const DOCUMENT_CATEGORIES = [
  { key: 'contract', label: '계약서', shortLabel: '계약', types: ['CONTRACT_DOCUMENT', 'LEASE_REPORT', 'SALE_CONTRACT'] },
  { key: 'registry', label: '등기부·인증', shortLabel: '인증', types: ['REGISTRY_CERTIFICATE'] },
  { key: 'receipt', label: '수리 영수증', shortLabel: '수리', types: ['RECEIPT'] },
  { key: 'photo', label: '사진', shortLabel: '사진', types: ['MOVE_PHOTO', 'PHOTO'] },
];

export const ALL_CATEGORY = 'all';
export const RECENT_LIMIT = 3;

export const findCategory = (key) => DOCUMENT_CATEGORIES.find((category) => category.key === key) ?? null;
const categoryOfType = (documentType) => DOCUMENT_CATEGORIES.find((category) => category.types.includes(documentType)) ?? null;

// 주소의 ?type 값 → 화면 상태. 'all' 이면 전체 목록, 아는 묶음이면 그 묶음 목록, 그 밖(없음·모르는 값)은 첫 화면(null).
export const parseCategoryParam = (value) => (value === ALL_CATEGORY || findCategory(value) ? value : null);

const byCreatedAtDesc = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

// 내 소유 문서·계약 문서를 한 줄로 모아 최근 올린 순으로 정렬한다. 계약 문서에는 그 계약(contract)을 붙여 둔다.
export const flattenDocuments = (box) => {
  if (!box) return [];
  const ownershipDocuments = (box.ownerships ?? []).flatMap((ownership) => ownership.documents ?? []);
  const contractDocuments = (box.contracts ?? []).flatMap((contract) => (contract.documents ?? []).map((document) => ({ ...document, contract })));
  return [...ownershipDocuments, ...contractDocuments].sort(byCreatedAtDesc);
};

// 종류 카드 칸마다 문서 수: { contract, registry, receipt, photo }
export const countByCategory = (documents) =>
  Object.fromEntries(
    DOCUMENT_CATEGORIES.map((category) => [category.key, documents.filter((document) => category.types.includes(document.documentType)).length]),
  );

// 묶음(category)과 검색어(파일 이름, 대소문자·앞뒤 공백 무시)로 거른다. category 가 없거나 'all' 이면 묶음으로 거르지 않는다.
export const filterDocuments = (documents, { category, query } = {}) => {
  const types = findCategory(category)?.types;
  const keyword = (query ?? '').trim().toLowerCase();
  return documents.filter(
    (document) => (!types || types.includes(document.documentType)) && (!keyword || (document.fileName ?? '').toLowerCase().includes(keyword)),
  );
};

// 줄 아래 보조 문구 조각: 종류(짧게) · 올린 날(KST) · 크기. 날짜·크기는 쓰는 쪽에서 숫자 글꼴로 그린다.
export const describeDocument = (document) => ({
  typeLabel: categoryOfType(document.documentType)?.shortLabel ?? getDocumentTypeLabel(document.documentType),
  date: formatDateKST(document.createdAt),
  size: formatBytes(document.sizeBytes),
});
