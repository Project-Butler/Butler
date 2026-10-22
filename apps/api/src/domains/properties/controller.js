import { AppError } from '../../platform/AppError.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parseAcquiredYearMonth,
  parsePagination,
  parsePurchasePrice,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import {
  COMBINED_UNIT_ADDRESS_REASON,
  isCombinedUnitAddress,
  normalizeBuildingNo,
  normalizeUnitNo,
} from '../../platform/unitAddress.js';
import { LISTING_FIELDS, parseListingFields } from '../../platform/unitListing.js';
import { isUuid } from '../../platform/uuid.js';
import {
  createPropertyWithOwnership,
  findMyProperties,
  findPropertyForUser,
  updateProperty,
} from './service.js';

const MAX_UNIT_PART_LENGTH = 10; // Property.buildingNo/unitNo VarChar(10)
const MAX_EXCLUSIVE_AREA = 999999.99; // Decimal(8,2)
const EXCLUSIVE_AREA_PATTERN = /^\d+(\.\d{1,2})?$/;
const MIN_FLOOR = -10;
const MAX_FLOOR = 200;

const CREATE_FIELDS = [
  'complexId',
  'buildingNo',
  'unitNo',
  'exclusiveArea',
  'floor',
  'acquiredYearMonth',
  'purchasePrice',
  ...LISTING_FIELDS,
];
const UPDATE_FIELDS = ['exclusiveArea', 'floor'];
const RELATIONS = ['OWNER', 'FORMER_OWNER', 'TENANT'];

// 면적은 Decimal(8,2) — 부동소수 오차 없이 넘기도록 원래 표기를 문자열로 검사해 그대로 넘긴다.
const parseExclusiveArea = (value, details) => {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!EXCLUSIVE_AREA_PATTERN.test(text) || Number(text) <= 0 || Number(text) > MAX_EXCLUSIVE_AREA) {
    details.push({ field: 'exclusiveArea', reason: `0보다 크고 ${MAX_EXCLUSIVE_AREA} 이하, 소수 둘째 자리까지여야 합니다.` });
    return undefined;
  }
  return text;
};

const parseFloor = (value, details) => {
  if (!Number.isInteger(value) || value < MIN_FLOOR || value > MAX_FLOOR) {
    details.push({ field: 'floor', reason: `${MIN_FLOOR}~${MAX_FLOOR} 사이의 정수여야 합니다.` });
    return undefined;
  }
  return value;
};

// '101-1203'처럼 동·호를 한 칸에 적으면 나눠 입력하도록 거부한다(길이 검사보다 먼저).
// 동은 비워도 된다(동이 없는 건물, 명세 변경 C6) — 빈 문자열로 저장한다.
const parseUnitPart = (normalized, field, details, { allowEmpty = false } = {}) => {
  if (isCombinedUnitAddress(normalized)) {
    details.push({ field, reason: COMBINED_UNIT_ADDRESS_REASON });
    return undefined;
  }
  const minLength = allowEmpty ? 0 : 1;
  if (normalized.length < minLength || normalized.length > MAX_UNIT_PART_LENGTH) {
    details.push({ field, reason: `${minLength}~${MAX_UNIT_PART_LENGTH}자 문자열이어야 합니다.` });
    return undefined;
  }
  return normalized;
};

// 생략·null은 동 없음(''). 문자열이 아닌 값은 거부한다.
const parseBuildingNo = (value, details) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    details.push({ field: 'buildingNo', reason: `0~${MAX_UNIT_PART_LENGTH}자 문자열이어야 합니다.` });
    return undefined;
  }
  return parseUnitPart(normalizeBuildingNo(value), 'buildingNo', details, { allowEmpty: true });
};

const parseCreateBody = (body) => {
  assertAllowedBody(body, CREATE_FIELDS);
  const details = [];

  if (!isUuid(body.complexId)) details.push({ field: 'complexId', reason: 'UUID 형식이어야 합니다.' });
  const buildingNo = typeof body.buildingNo === 'string' ? body.buildingNo : '';
  const input = {
    complexId: body.complexId,
    buildingNo: parseBuildingNo(body.buildingNo, details),
    unitNo: parseUnitPart(normalizeUnitNo(body.unitNo, buildingNo), 'unitNo', details),
    exclusiveArea: null,
    floor: null,
    acquiredYearMonth: null,
    purchasePrice: null,
    // 오지 않은 칸은 키가 없다 → service가 내가 끝낸 이전 소유 관계의 값을 이어받는다.
    listing: parseListingFields(body, details),
  };

  // 선택 필드는 생략하거나 null이면 값 없음으로 본다.
  if (body.exclusiveArea != null) input.exclusiveArea = parseExclusiveArea(body.exclusiveArea, details);
  if (body.floor != null) input.floor = parseFloor(body.floor, details);
  if (body.acquiredYearMonth != null) input.acquiredYearMonth = parseAcquiredYearMonth(body.acquiredYearMonth, details);
  if (body.purchasePrice != null) input.purchasePrice = parsePurchasePrice(body.purchasePrice, details);

  throwIfInvalid(details);
  return input;
};

const parseUpdateBody = (body) => {
  assertAllowedBody(body, UPDATE_FIELDS);
  if (Object.keys(body).length === 0) {
    throw new AppError('VALIDATION_ERROR', 400, '수정할 값이 없습니다.', [
      { field: 'body', reason: `${UPDATE_FIELDS.join(', ')} 중 하나 이상이 필요합니다.` },
    ]);
  }

  const details = [];
  const data = {};
  // null을 보내면 값을 비운다(api-contract.md 1장 "수정(PATCH)").
  if (body.exclusiveArea !== undefined) {
    data.exclusiveArea = body.exclusiveArea === null ? null : parseExclusiveArea(body.exclusiveArea, details);
  }
  if (body.floor !== undefined) {
    data.floor = body.floor === null ? null : parseFloor(body.floor, details);
  }

  throwIfInvalid(details);
  return data;
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];

  const relation = query.relation ?? 'OWNER';
  if (!RELATIONS.includes(relation)) {
    details.push({ field: 'relation', reason: `${RELATIONS.join(', ')} 중 하나여야 합니다.` });
  }
  const { page, size } = parsePagination(query, details);

  // 명세 변경 C8: 한 단지(건물)의 호실만
  const complexId = query.complexId ?? null;
  if (complexId !== null && !isUuid(complexId)) details.push({ field: 'complexId', reason: 'UUID 형식이어야 합니다.' });

  throwIfInvalid(details);
  return { relation, page, size, complexId };
};

const throwPropertyNotFound = () => {
  throw new AppError('PROPERTY_NOT_FOUND', 404, '호실을 찾을 수 없습니다.');
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const createProperty = async (req, res, next) => {
  try {
    const result = await createPropertyWithOwnership(req.user, parseCreateBody(req.body));
    sendData(res, result, { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const listProperties = async (req, res, next) => {
  try {
    const { items, meta } = await findMyProperties(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    // 형식이 틀린 id·없는 호실·관계 없는 호실은 모두 같은 404로 존재를 숨긴다.
    const property = isUuid(propertyId) ? await findPropertyForUser(req.user, propertyId) : null;
    if (!property) throwPropertyNotFound();

    sendData(res, property);
  } catch (error) {
    next(error);
  }
};

export const patchProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    if (!isUuid(propertyId)) throwPropertyNotFound();

    const property = await updateProperty(req.user, propertyId, parseUpdateBody(req.body));
    sendData(res, property);
  } catch (error) {
    next(error);
  }
};
