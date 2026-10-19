// 요청 검증 공용 함수(DB 의존 없음). properties·propertyOwnerships·complexes 컨트롤러가 함께 쓴다.
import { AppError } from './AppError.js';
import { getTodayKST } from './dateUtils.js';

// api-contract.md 1장 "목록 조회": page는 1부터, size는 기본 20·최대 100
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;
// (page - 1) * size가 Prisma skip·raw OFFSET(Int32)에 안전하게 들어가도록 page 상한을 둔다.
export const MAX_PAGE = 10000;

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const throwIfInvalid = (details) => {
  if (details.length > 0) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', details);
  }
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 요청 바디가 객체인지, 허용 필드 밖의 키가 없는지 확인한다(api-contract.md 1장 "수정(PATCH)").
export const assertAllowedBody = (body, allowedFields) => {
  if (!isPlainObject(body)) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', [
      { field: 'body', reason: 'JSON 객체여야 합니다.' },
    ]);
  }
  const details = Object.keys(body)
    .filter((field) => !allowedFields.includes(field))
    .map((field) => ({ field, reason: '허용되지 않는 필드입니다.' }));
  throwIfInvalid(details);
};

// ?a=1&a=2처럼 같은 키가 여러 번 오면 배열이 되므로 문자열 하나만 받는다.
export const assertSingleValues = (query) => {
  const details = [];
  for (const [field, value] of Object.entries(query)) {
    if (typeof value !== 'string') details.push({ field, reason: '한 번만 보낼 수 있습니다.' });
  }
  throwIfInvalid(details);
};

const parsePositiveInt = (value, field, details) => {
  const number = Number(value);
  if (typeof value !== 'string' || !Number.isSafeInteger(number) || number < 1) {
    details.push({ field, reason: '1 이상의 정수여야 합니다.' });
    return null;
  }
  return number;
};

// page·size 쿼리. 잘못된 값은 details에 쌓고 해당 값은 null.
export const parsePagination = (query, details) => {
  let page = 1;
  if (query.page !== undefined) {
    page = parsePositiveInt(query.page, 'page', details);
    if (page !== null && page > MAX_PAGE) {
      details.push({ field: 'page', reason: `${MAX_PAGE} 이하여야 합니다.` });
    }
  }
  let size = DEFAULT_SIZE;
  if (query.size !== undefined) {
    size = parsePositiveInt(query.size, 'size', details);
    if (size !== null && size > MAX_SIZE) details.push({ field: 'size', reason: `${MAX_SIZE} 이하여야 합니다.` });
  }
  return { page, size };
};

// 'YYYY-MM', KST 기준 이번 달 이하.
export const parseAcquiredYearMonth = (value, details) => {
  if (typeof value !== 'string' || !YEAR_MONTH_PATTERN.test(value)) {
    details.push({ field: 'acquiredYearMonth', reason: 'YYYY-MM 형식이어야 합니다.' });
    return undefined;
  }
  if (value > getTodayKST().slice(0, 7)) {
    details.push({ field: 'acquiredYearMonth', reason: '이번 달 이후일 수 없습니다.' });
    return undefined;
  }
  return value;
};

// 원 단위 정수 → DB bigint. 응답에서는 toMoney()로 다시 number가 된다.
export const parsePurchasePrice = (value, details) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    details.push({ field: 'purchasePrice', reason: '0 이상의 정수여야 합니다.' });
    return undefined;
  }
  return BigInt(value);
};
