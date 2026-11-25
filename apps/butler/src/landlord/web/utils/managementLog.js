// 하우스 로그 화면 공통 값·표시 함수(계약 5장, docs/5. 부동산 관리 로그 개발/명세.md).
import { getTodayKST } from './contract';

export const SCOPE_LABEL = { PRIVATE: '나만 보기', PROPERTY_HISTORY: '호실 이력' };
export const VERIFICATION_REQUIRED_MESSAGE = '권리자 인증 후 쓸 수 있어요';
// 기록 팝업 안내(H-29·H-37). 수리·점검은 인증 뒤 늘 호실 이력, 인증 전 기록은 모두 나만 보기.
export const HISTORY_ONLY_TYPES = ['REPAIR', 'INSPECTION'];
export const HISTORY_NOTICE = '집 이력으로 남아요 — 이 집을 넘기면 다음 임대인도 봐요';
export const UNVERIFIED_PRIVATE_NOTICE = '권리자 인증 전이라 나만 보기로 저장돼요';
export const SOLD_PRIVATE_NOTICE = '매도한 호실이라 나만 보기로 저장돼요 — 새 임대인에게는 넘어가지 않아요';
export const UNVERIFIED_LOG_WARNING = '권리자 인증 전에 남긴 기록은 호실이 목록에서 빠지면(삭제·자동 종료) 모두 사라져요';

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

// 작성자가 비어 있으면 다른 소유자가 직접 쓴 기록(platform + 만든 곳 없음) 또는 시스템 기록이다.
export const getLogOriginLabel = ({ author, source }) => {
  if (author) return null;
  return source?.feature === 'platform' && !source.resourceType ? '이전 소유자' : '자동 기록';
};

// '2026-10-12' → '10.12'
export const formatLogDate = (occurredOn) => occurredOn.slice(5).replace('-', '.');
