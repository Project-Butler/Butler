// 관리 로그 화면 공통 값·표시 함수(계약 5장, docs/5. 부동산 관리 로그 개발/명세.md).
import { getTodayKST } from './contract';

export const SCOPE_LABEL = { PRIVATE: '나만 보기', PROPERTY_HISTORY: '호실 이력' };
export const VERIFICATION_REQUIRED_MESSAGE = '권리자 인증 후 쓸 수 있어요';

const TYPE_LABEL = { REPAIR: '수리', INSPECTION: '점검', NOTE: '메모', TICKET_SUMMARY: '수리 요청 완료' };
export const WRITABLE_TYPE_OPTIONS = ['REPAIR', 'INSPECTION', 'NOTE'].map((value) => ({ value, label: TYPE_LABEL[value] }));
export const TYPE_FILTER_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

export const getLogTypeLabel = (type) => TYPE_LABEL[type] ?? type;
export const getLogScopeBadge = (scope) => ({
  label: SCOPE_LABEL[scope] ?? scope,
  tone: scope === 'PROPERTY_HISTORY' ? 'verified' : 'default',
});

// 미래 날짜 기록은 "예정"으로 보여 준다(D-10).
export const isFutureLog = ({ occurredOn }, today = getTodayKST()) => occurredOn > today;

// 작성자가 비어 있으면 시스템 기록(만든 곳이 있다) 또는 다른 소유자가 직접 쓴 기록이다.
export const getLogOriginLabel = ({ author, source }) => {
  if (author) return null;
  return source?.resourceType ? '자동 기록' : '이전 소유자';
};

// 나만 보기를 내가 쓴 경우만 지울 수 있다. 소유가 끝난 뒤에도 된다(D-13).
export const canDeleteLog = ({ author, scope }) => Boolean(author) && scope === 'PRIVATE';

// '2026-10-12' → '10.12'
export const formatLogDate = (occurredOn) => occurredOn.slice(5).replace('-', '.');
