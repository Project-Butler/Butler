// 계약 입력·수정·해지 규칙과 상태 필터 변환(순수 함수, DB 의존 없음).
// 규칙 출처: docs/4. 계약 관리 개발/명세.md R-01~R-11a, D-03·D-05·D-13·D-15.
import { CONTRACT_EXPIRING_SOON_DAYS } from './contractStatus.js';
import { compareDateStrings } from './dateUtils.js';

export const LEASE_TYPES = ['MONTHLY', 'JEONSE'];
export const CONTRACT_STATUSES = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED'];

// PATCH /contracts/:id 로 바꿀 수 있는 칸(api-contract.md 4장)
export const CONTRACT_EDITABLE_FIELDS = [
  'leaseType',
  'deposit',
  'monthlyRent',
  'startDate',
  'endDate',
  'tenantName',
  'tenantPhone',
  'memo',
];
// 진행 중 계약은 연락처·메모만(D-13). 수정 이력이 없어 조건을 덮어쓰면 원래 값이 사라진다.
const ACTIVE_EDITABLE_FIELDS = ['tenantPhone', 'memo'];

const TENANT_PHONE_PATTERN = /^010\d{7,8}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 하이픈·공백을 지운 숫자만 저장한다(D-03). 형식이 틀리면 null.
export const normalizeTenantPhone = (value) => {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s-]/g, '');
  return TENANT_PHONE_PATTERN.test(digits) ? digits : null;
};

// 'YYYY-MM-DD'이고 실제로 있는 날짜인지(2026-02-30 같은 값 거부).
export const isValidDateString = (value) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// R-03: 보증금 0 이상. 월세는 월세 1 이상, 전세는 월세 0 + 보증금 0 초과. 금액은 BigInt.
export const isValidAmount = ({ leaseType, deposit, monthlyRent }) => {
  if (deposit < 0n || monthlyRent < 0n) return false;
  if (leaseType === 'MONTHLY') return monthlyRent >= 1n;
  return monthlyRent === 0n && deposit > 0n;
};

// R-04: 종료일이 시작일보다 뒤.
export const isValidPeriod = ({ startDate, endDate }) => compareDateStrings(endDate, startDate) > 0;

// R-11(D-15): 해지일 ≤ 종료일 AND 해지일 ≤ 오늘(KST). 아래 한계는 없다(시작 전 계약 취소).
export const isValidTermination = ({ endDate, terminatedOn, todayKST }) =>
  compareDateStrings(terminatedOn, endDate) <= 0 && compareDateStrings(terminatedOn, todayKST) <= 0;

// D-13: 이 상태에서 바꿀 수 없는 칸 목록(보낸 칸 기준).
export const lockedFieldsForStatus = (status, fields) =>
  status === 'UPCOMING' ? [] : fields.filter((field) => !ACTIVE_EDITABLE_FIELDS.includes(field));

// R-08: 만료·해지됐거나 소유 관계가 끝난 계약은 읽기 전용.
export const isContractReadOnly = (status, ownershipEnded) =>
  ownershipEnded || status === 'EXPIRED' || status === 'TERMINATED';

// 두 기간이 겹치는지(양끝 포함).
export const periodsOverlap = (a, b) =>
  compareDateStrings(a.startDate, b.endDate) <= 0 && compareDateStrings(b.startDate, a.endDate) <= 0;

const toDbDate = (dateString) => new Date(`${dateString}T00:00:00Z`);

const addDays = (dateString, days) => {
  const date = toDbDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

// GET /contracts?status= 를 Prisma where로 바꾼다. 기준은 contractStatus.js computeContractStatus.
// UPCOMING이 먼저 판정되므로 진행 중 상태에는 startDate ≤ today를 반드시 붙인다.
export const statusToWhere = (statuses, todayKST) => {
  const today = toDbDate(todayKST);
  const soon = addDays(todayKST, CONTRACT_EXPIRING_SOON_DAYS);
  const started = { startDate: { lte: today }, terminatedOn: null };
  const conditions = {
    TERMINATED: { terminatedOn: { not: null } },
    UPCOMING: { startDate: { gt: today }, terminatedOn: null },
    EXPIRED: { ...started, endDate: { lt: today } },
    EXPIRING_SOON: { ...started, endDate: { gte: today, lte: soon } },
    ACTIVE: { ...started, endDate: { gt: soon } },
  };
  return { OR: statuses.map((status) => conditions[status]) };
};
