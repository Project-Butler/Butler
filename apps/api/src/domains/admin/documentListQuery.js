// GET /admin/documents 쿼리 검사(api-contract.md 8장 "관리자 문서 목록"). DB 의존 없음 — 단위 테스트 대상.
// 첨부 위치(resourceType) 허용값은 문서 권한 정책 표(SUPPORTED_RESOURCE_TYPES) 하나에서 가져온다. 새 종류가 생기면 여기도 저절로 따라간다.
import { isValidLogDate } from '../../platform/managementLogRules.js';
import { assertSingleValues, parsePagination, throwIfInvalid } from '../../platform/requestValidation.js';
import { isUuid } from '../../platform/uuid.js';
import { SUPPORTED_RESOURCE_TYPES } from '../documents/resourcePolicies.js';

// resourceType은 쉼표로 여러 개. 비었으면 null(= 모든 종류).
const parseResourceTypes = (value, details) => {
  if (value === undefined || value.trim() === '') return null;
  const types = [...new Set(value.split(',').map((type) => type.trim()))];
  if (types.some((type) => !SUPPORTED_RESOURCE_TYPES.includes(type))) {
    details.push({ field: 'resourceType', reason: `${SUPPORTED_RESOURCE_TYPES.join(', ')} 중에서 쉼표로 고릅니다.` });
    return null;
  }
  return types;
};

// from·until은 KST 날짜(YYYY-MM-DD)이고 그날을 포함한다(하우스 로그 목록과 같은 규칙).
export const parseDocumentListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const resourceTypes = parseResourceTypes(query.resourceType, details);
  if (query.uploaderId !== undefined && !isUuid(query.uploaderId)) {
    details.push({ field: 'uploaderId', reason: 'UUID 형식이어야 합니다.' });
  }
  for (const field of ['from', 'until']) {
    if (query[field] !== undefined && !isValidLogDate(query[field])) details.push({ field, reason: 'YYYY-MM-DD 날짜여야 합니다.' });
  }
  // 같은 형식의 날짜 문자열이라 문자열 비교로 순서를 본다.
  if (isValidLogDate(query.from) && isValidLogDate(query.until) && query.from > query.until) {
    details.push({ field: 'from', reason: 'until보다 늦을 수 없습니다.' });
  }
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);
  return {
    resourceTypes,
    uploaderId: query.uploaderId ?? null,
    from: query.from ?? null,
    until: query.until ?? null,
    page,
    size,
  };
};
