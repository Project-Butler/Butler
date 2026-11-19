// 통합 검색 화면 표기 도우미(임대인 앱·임차인이 같이 쓴다). 순수 함수.
import { daysBetween, formatDday, formatManwon, getTenantStatusBadge } from '../contractFormat';

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 50;

// 응답 키 → 섹션 제목. 화면은 이 순서로 그린다(결과가 없는 섹션은 그리지 않는다).
export const SECTIONS = [
  { key: 'properties', title: '부동산' },
  { key: 'contracts', title: '계약' },
  { key: 'tickets', title: '수리·점검' },
  { key: 'managementLogs', title: '관리 로그' },
  { key: 'documents', title: '문서' },
  { key: 'schedules', title: '일정' },
];

// 앞뒤 공백을 지우고 가운데 연속 공백은 하나로. 서버 검사와 같은 규칙이다.
export const normalizeQuery = (value) => (value ?? '').trim().replace(/\s+/g, ' ');

export const isSearchableQuery = (value) => {
  const query = normalizeQuery(value);
  return query.length >= MIN_QUERY_LENGTH && query.length <= MAX_QUERY_LENGTH;
};

export const countResults = (data) => (data ? SECTIONS.reduce((sum, { key }) => sum + (data[key]?.length ?? 0), 0) : 0);

// 검색어 단어를 강조할 조각으로 나눈다. [{ text, match }]. 대소문자 무시, 긴 단어부터 맞춘다.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const splitHighlight = (text, query) => {
  const source = text ?? '';
  const tokens = [...new Set(normalizeQuery(query).split(' ').filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!source || tokens.length === 0) return [{ text: source, match: false }];
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  return source
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: tokens.some((token) => token.toLowerCase() === part.toLowerCase()) }));
};

// '2026-10-20' → '10-20'
export const formatShortDate = (dateString) => (typeof dateString === 'string' ? dateString.slice(5, 10) : '');

// ISO 시각 → KST 'YYYY-MM-DD'
export const toKstDate = (isoString) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

// 호실 줄 아래 설명: '계약 중 · 보증금 5,000만', 계약이 없으면 '계약 없음'
export const describeProperty = (property) => {
  const contract = property.currentContract;
  if (!contract) return '계약 없음';
  const deposit = formatManwon(contract.deposit)?.replace(/ 원$/, '');
  return [getTenantStatusBadge(contract.status).label, deposit ? `보증금 ${deposit}` : null].filter(Boolean).join(' · ');
};

const DOCUMENT_TYPE_LABEL = {
  CONTRACT_DOCUMENT: '계약서',
  REGISTRY_CERTIFICATE: '등기부',
  PHOTO: '사진',
  OTHER: '기타',
  SALE_CONTRACT: '매매계약서',
  INSURANCE: '보험',
  LEASE_REPORT: '임대차 신고',
  RECEIPT: '영수증',
  MOVE_PHOTO: '입주 사진',
};

export const describeDocument = (document) =>
  [DOCUMENT_TYPE_LABEL[document.type] ?? '문서', toKstDate(document.createdAt)].filter(Boolean).join(' · ');

export const isImageDocument = (document) => typeof document.mimeType === 'string' && document.mimeType.startsWith('image/');

const TICKET_STATUS_LABEL = { OPEN: '접수', IN_PROGRESS: '처리 중', DONE: '완료', CANCELED: '취소' };

export const describeTicket = (ticket) =>
  [TICKET_STATUS_LABEL[ticket.status] ?? ticket.status, toKstDate(ticket.createdAt)].filter(Boolean).join(' · ');

export const describeSchedule = (schedule) => [schedule.date, schedule.time].filter(Boolean).join(' ');

// 오늘부터 남은 날(지난 일정은 null — 배지를 붙이지 않는다)
export const getScheduleDday = (schedule, today) => {
  const days = daysBetween(today, schedule.date);
  return days < 0 ? null : formatDday(days);
};
