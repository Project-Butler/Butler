import { DisputeCategory, DisputePropertyKind, DisputeReferenceType } from '@prisma/client';
import { AppError } from '../../platform/AppError.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { findReferenceById, findReferences, SORTABLE_FIELDS } from './service.js';

// api-contract.md 1장 "목록 조회": page는 1부터, size는 기본 20·최대 100
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;
const MAX_KEYWORD_LENGTH = 100;

const parsePositiveInt = (value, field, details) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    details.push({ field, reason: '1 이상의 정수여야 합니다.' });
    return null;
  }
  return number;
};

const parseEnum = (value, field, allowed, details) => {
  if (!Object.values(allowed).includes(value)) {
    details.push({ field, reason: `${Object.values(allowed).join(', ')} 중 하나여야 합니다.` });
    return null;
  }
  return value;
};

const parseListQuery = (query) => {
  const details = [];
  const filters = {};

  // ?type=A&type=B처럼 같은 키가 여러 번 오면 배열이 되므로 문자열만 받는다.
  for (const [field, value] of Object.entries(query)) {
    if (typeof value !== 'string') {
      details.push({ field, reason: '한 번만 보낼 수 있습니다.' });
    }
  }
  if (details.length > 0) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', details);
  }

  const { type, category, propertyKind, q, page, size, sort } = query;

  if (type !== undefined) filters.type = parseEnum(type, 'type', DisputeReferenceType, details);
  if (category !== undefined) filters.category = parseEnum(category, 'category', DisputeCategory, details);
  if (propertyKind !== undefined) {
    filters.propertyKind = parseEnum(propertyKind, 'propertyKind', DisputePropertyKind, details);
  }

  let keyword = null;
  if (q !== undefined) {
    keyword = q.trim();
    if (keyword.length === 0) keyword = null;
    else if (keyword.length > MAX_KEYWORD_LENGTH) {
      details.push({ field: 'q', reason: `${MAX_KEYWORD_LENGTH}자 이하여야 합니다.` });
    }
  }

  const pageNumber = page === undefined ? 1 : parsePositiveInt(page, 'page', details);

  let pageSize = DEFAULT_SIZE;
  if (size !== undefined) {
    pageSize = parsePositiveInt(size, 'size', details);
    if (pageSize !== null && pageSize > MAX_SIZE) {
      details.push({ field: 'size', reason: `${MAX_SIZE} 이하여야 합니다.` });
    }
  }

  let orderBy = { field: 'createdAt', direction: 'desc' };
  if (sort !== undefined) {
    const [field, direction] = sort.split(':');
    if (!SORTABLE_FIELDS.includes(field) || !['asc', 'desc'].includes(direction)) {
      details.push({ field: 'sort', reason: `필드:asc|desc 형식이고 필드는 ${SORTABLE_FIELDS.join(', ')} 중 하나여야 합니다.` });
    } else {
      orderBy = { field, direction };
    }
  }

  if (details.length > 0) {
    throw new AppError('VALIDATION_ERROR', 400, '요청 값이 올바르지 않습니다.', details);
  }

  return { filters, keyword, page: pageNumber, size: pageSize, orderBy };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const listReferences = async (req, res, next) => {
  try {
    const { items, meta } = await findReferences(parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getReference = async (req, res, next) => {
  try {
    const { referenceId } = req.params;
    // 형식이 틀린 id는 DB를 조회하지 않고 없는 자료와 같은 404로 응답한다.
    const reference = isUuid(referenceId) ? await findReferenceById(referenceId) : null;

    if (!reference) {
      throw new AppError('DISPUTE_REFERENCE_NOT_FOUND', 404, '분쟁 참고자료를 찾을 수 없습니다.');
    }

    sendData(res, reference);
  } catch (error) {
    next(error);
  }
};
