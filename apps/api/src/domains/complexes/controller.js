import { AppError } from '../../platform/AppError.js';
import { assertSingleValues, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import {
  COMBINED_UNIT_ADDRESS_REASON,
  isCombinedUnitAddress,
  normalizeBuildingNo,
  normalizeUnitNo,
} from '../../platform/unitAddress.js';
import { isUuid } from '../../platform/uuid.js';
import { findComplexById, findUnitInfo, resolveComplex, searchComplexes } from './service.js';

// api-contract.md 2장: query 2자 이상, size 기본 20·최대 50, 페이지 없음
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const DEFAULT_SEARCH_SIZE = 20;
const MAX_SEARCH_SIZE = 50;
const MAX_UNIT_PART_LENGTH = 10;

// sourceKey는 provider가 만든 값만 받는다: KAPT:<단지코드> 또는 PNU:<19자리>
const SOURCE_KEY_PATTERN = /^(KAPT:[A-Z0-9]{1,20}|PNU:\d{19})$/;

// 도로명주소 API가 검색어에 있으면 거부하는 특수문자
const SEARCH_FORBIDDEN_CHARS = /[%=><[\]]/g;

const parseSearchQuery = (query) => {
  assertSingleValues(query);
  const details = [];

  let keyword = null;
  if (query.query === undefined) {
    details.push({ field: 'query', reason: '필수 값입니다.' });
  } else {
    keyword = query.query.replace(SEARCH_FORBIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim();
    if (keyword.length < MIN_QUERY_LENGTH || keyword.length > MAX_QUERY_LENGTH) {
      details.push({ field: 'query', reason: `${MIN_QUERY_LENGTH}자 이상 ${MAX_QUERY_LENGTH}자 이하여야 합니다.` });
    }
  }

  let size = DEFAULT_SEARCH_SIZE;
  if (query.size !== undefined) {
    size = Number(query.size);
    if (!Number.isInteger(size) || size < 1 || size > MAX_SEARCH_SIZE) {
      details.push({ field: 'size', reason: `1 이상 ${MAX_SEARCH_SIZE} 이하의 정수여야 합니다.` });
    }
  }

  throwIfInvalid(details);
  return { query: keyword, size };
};

const parseResolveBody = (body) => {
  const details = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throwIfInvalid([{ field: 'body', reason: 'JSON 객체여야 합니다.' }]);
  }

  for (const field of Object.keys(body)) {
    if (field !== 'sourceKey') details.push({ field, reason: '허용되지 않은 필드입니다.' });
  }

  const { sourceKey } = body;
  if (typeof sourceKey !== 'string' || !SOURCE_KEY_PATTERN.test(sourceKey)) {
    details.push({ field: 'sourceKey', reason: '단지 검색 결과의 sourceKey여야 합니다.' });
  }

  throwIfInvalid(details);
  return sourceKey;
};

const parseUnitInfoQuery = (query) => {
  assertSingleValues(query);
  const details = [];

  // '101-1203'처럼 동·호를 한 칸에 적으면 나눠 입력하도록 거부한다(길이 검사보다 먼저).
  const buildingNo = normalizeBuildingNo(query.buildingNo);
  if (isCombinedUnitAddress(buildingNo)) {
    details.push({ field: 'buildingNo', reason: COMBINED_UNIT_ADDRESS_REASON });
  } else if (buildingNo.length < 1 || buildingNo.length > MAX_UNIT_PART_LENGTH) {
    details.push({ field: 'buildingNo', reason: `1자 이상 ${MAX_UNIT_PART_LENGTH}자 이하여야 합니다.` });
  }

  const unitNo = normalizeUnitNo(query.unitNo, query.buildingNo);
  if (isCombinedUnitAddress(unitNo)) {
    details.push({ field: 'unitNo', reason: COMBINED_UNIT_ADDRESS_REASON });
  } else if (unitNo.length < 1 || unitNo.length > MAX_UNIT_PART_LENGTH) {
    details.push({ field: 'unitNo', reason: `1자 이상 ${MAX_UNIT_PART_LENGTH}자 이하여야 합니다.` });
  }

  throwIfInvalid(details);
  return { buildingNo, unitNo };
};

const throwComplexNotFound = () => {
  throw new AppError('COMPLEX_NOT_FOUND', 404, '단지를 찾을 수 없습니다.');
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const searchComplexList = async (req, res, next) => {
  try {
    const items = await searchComplexes(parseSearchQuery(req.query));
    sendData(res, items);
  } catch (error) {
    next(error);
  }
};

export const resolveComplexBySourceKey = async (req, res, next) => {
  try {
    const complex = await resolveComplex(parseResolveBody(req.body));
    sendData(res, complex);
  } catch (error) {
    next(error);
  }
};

export const getComplex = async (req, res, next) => {
  try {
    const { complexId } = req.params;
    // 형식이 틀린 id는 DB를 조회하지 않고 없는 단지와 같은 404로 응답한다.
    const complex = isUuid(complexId) ? await findComplexById(complexId) : null;
    if (!complex) throwComplexNotFound();

    sendData(res, complex);
  } catch (error) {
    next(error);
  }
};

export const getComplexUnitInfo = async (req, res, next) => {
  try {
    const { complexId } = req.params;
    if (!isUuid(complexId)) throwComplexNotFound();

    const unitInfo = await findUnitInfo({ complexId, ...parseUnitInfoQuery(req.query) });
    sendData(res, unitInfo);
  } catch (error) {
    next(error);
  }
};
