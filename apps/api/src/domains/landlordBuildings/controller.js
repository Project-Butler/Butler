import { AppError } from '../../platform/AppError.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import {
  createLandlordBuilding,
  deleteLandlordBuilding,
  findLandlordBuildingForUser,
  findMyLandlordBuildings,
  updateLandlordBuilding,
} from './service.js';

const MAX_NAME_LENGTH = 50; // LandlordBuilding.name VarChar(50)
const MAX_MEMO_LENGTH = 500; // LandlordBuilding.memo VarChar(500)
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 999;

const CREATE_FIELDS = ['complexId', 'name', 'capacity', 'memo'];
const UPDATE_FIELDS = ['name', 'capacity', 'memo'];

const parseName = (value, details) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > MAX_NAME_LENGTH) {
    details.push({ field: 'name', reason: `1~${MAX_NAME_LENGTH}자 문자열이어야 합니다.` });
    return undefined;
  }
  return text;
};

// null이면 정원 없음(정원 검사 안 함).
const parseCapacity = (value, details) => {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < MIN_CAPACITY || value > MAX_CAPACITY) {
    details.push({ field: 'capacity', reason: `${MIN_CAPACITY}~${MAX_CAPACITY} 사이의 정수여야 합니다.` });
    return undefined;
  }
  return value;
};

// 앞뒤 공백을 떼고, 비면 null.
const parseMemo = (value, details) => {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length > MAX_MEMO_LENGTH) {
    details.push({ field: 'memo', reason: `${MAX_MEMO_LENGTH}자 이하 문자열이어야 합니다.` });
    return undefined;
  }
  return value.trim() || null;
};

const parseCreateBody = (body) => {
  assertAllowedBody(body, CREATE_FIELDS);
  const details = [];
  if (!isUuid(body.complexId)) details.push({ field: 'complexId', reason: 'UUID 형식이어야 합니다.' });
  const input = {
    complexId: body.complexId,
    name: parseName(body.name, details),
    capacity: body.capacity === undefined ? null : parseCapacity(body.capacity, details),
    memo: body.memo === undefined ? null : parseMemo(body.memo, details),
  };
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
  if (body.name !== undefined) data.name = parseName(body.name, details);
  if (body.capacity !== undefined) data.capacity = parseCapacity(body.capacity, details);
  if (body.memo !== undefined) data.memo = parseMemo(body.memo, details);
  throwIfInvalid(details);
  return data;
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const { page, size } = parsePagination(query, details);
  let includeDeleted = false;
  if (query.includeDeleted !== undefined) {
    if (query.includeDeleted !== 'true' && query.includeDeleted !== 'false') {
      details.push({ field: 'includeDeleted', reason: 'true 또는 false여야 합니다.' });
    }
    includeDeleted = query.includeDeleted === 'true';
  }
  throwIfInvalid(details);
  return { page, size, includeDeleted };
};

const throwNotFound = () => {
  throw new AppError('LANDLORD_BUILDING_NOT_FOUND', 404, '건물을 찾을 수 없습니다.');
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postLandlordBuilding = async (req, res, next) => {
  try {
    const building = await createLandlordBuilding(req.user, parseCreateBody(req.body));
    sendData(res, building, { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const listLandlordBuildings = async (req, res, next) => {
  try {
    const { items, meta } = await findMyLandlordBuildings(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getLandlordBuilding = async (req, res, next) => {
  try {
    const { landlordBuildingId } = req.params;
    // 형식이 틀린 id·없는 설정·남의 설정은 모두 같은 404로 존재를 숨긴다.
    const building = isUuid(landlordBuildingId) ? await findLandlordBuildingForUser(req.user, landlordBuildingId) : null;
    if (!building) throwNotFound();
    sendData(res, building);
  } catch (error) {
    next(error);
  }
};

export const patchLandlordBuilding = async (req, res, next) => {
  try {
    const { landlordBuildingId } = req.params;
    if (!isUuid(landlordBuildingId)) throwNotFound();
    const building = await updateLandlordBuilding(req.user, landlordBuildingId, parseUpdateBody(req.body));
    sendData(res, building);
  } catch (error) {
    next(error);
  }
};

export const removeLandlordBuilding = async (req, res, next) => {
  try {
    const { landlordBuildingId } = req.params;
    if (!isUuid(landlordBuildingId)) throwNotFound();
    await deleteLandlordBuilding(req.user, landlordBuildingId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
