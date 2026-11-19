// 통합 검색 요청 검사와 응답(api-contract.md 7장 "검색" v1.1, #172).
import { assertSingleValues, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, SEARCH_TYPES } from './searchQuery.js';
import { searchAll } from './service.js';

// query: 앞뒤 공백을 지운 뒤 2~50자(가운데 연속 공백은 하나로). types: 쉼표로 이은 SearchType, 생략·빈 값이면 전부.
export const parseSearchQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const text = typeof query.query === 'string' ? query.query.trim().replace(/\s+/g, ' ') : '';
  if (text.length < MIN_QUERY_LENGTH || text.length > MAX_QUERY_LENGTH) {
    details.push({ field: 'query', reason: `${MIN_QUERY_LENGTH}자 이상 ${MAX_QUERY_LENGTH}자 이하로 입력해 주세요.` });
  }
  let types = SEARCH_TYPES;
  if (typeof query.types === 'string' && query.types.trim() !== '') {
    const requested = [...new Set(query.types.split(',').map((type) => type.trim()))];
    const unknown = requested.filter((type) => !SEARCH_TYPES.includes(type));
    if (unknown.length > 0) details.push({ field: 'types', reason: `${SEARCH_TYPES.join(', ')} 중에서 골라 주세요.` });
    else types = requested;
  }
  throwIfInvalid(details);
  return { query: text, types };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const search = async (req, res, next) => {
  try {
    sendData(res, await searchAll(req.user, parseSearchQuery(req.query)));
  } catch (error) {
    next(error);
  }
};
