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
import { isUuid } from '../../platform/uuid.js';
import { endOwnership, findMyOwnerships, findOwnershipForUser, updateOwnership } from './service.js';

const UPDATE_FIELDS = ['acquiredYearMonth', 'purchasePrice'];
const END_FIELDS = ['reason'];
const MAX_END_REASON_LENGTH = 200;

const throwOwnershipNotFound = () => {
  throw new AppError('OWNERSHIP_NOT_FOUND', 404, '소유 관계를 찾을 수 없습니다.');
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];

  // 생략하면 활성·종료 전부.
  let active = null;
  if (query.active !== undefined) {
    if (query.active === 'true') active = true;
    else if (query.active === 'false') active = false;
    else details.push({ field: 'active', reason: 'true 또는 false여야 합니다.' });
  }
  const { page, size } = parsePagination(query, details);

  throwIfInvalid(details);
  return { active, page, size };
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
  if (body.acquiredYearMonth !== undefined) {
    data.acquiredYearMonth =
      body.acquiredYearMonth === null ? null : parseAcquiredYearMonth(body.acquiredYearMonth, details);
  }
  if (body.purchasePrice !== undefined) {
    data.purchasePrice = body.purchasePrice === null ? null : parsePurchasePrice(body.purchasePrice, details);
  }

  throwIfInvalid(details);
  return data;
};

const parseEndBody = (body) => {
  // 바디 없이 보내도 된다(reason은 선택).
  const input = body ?? {};
  assertAllowedBody(input, END_FIELDS);

  const { reason } = input;
  if (reason === undefined || reason === null) return { reason: null };
  if (typeof reason !== 'string' || reason.length > MAX_END_REASON_LENGTH) {
    throwIfInvalid([{ field: 'reason', reason: `${MAX_END_REASON_LENGTH}자 이하 문자열이어야 합니다.` }]);
  }
  return { reason: reason.trim() || null };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const listOwnerships = async (req, res, next) => {
  try {
    const { items, meta } = await findMyOwnerships(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getOwnership = async (req, res, next) => {
  try {
    const { ownershipId } = req.params;
    // 형식이 틀린 id·없는 소유 관계·남의 소유 관계는 모두 같은 404로 존재를 숨긴다.
    const ownership = isUuid(ownershipId) ? await findOwnershipForUser(req.user, ownershipId) : null;
    if (!ownership) throwOwnershipNotFound();

    sendData(res, ownership);
  } catch (error) {
    next(error);
  }
};

export const patchOwnership = async (req, res, next) => {
  try {
    const { ownershipId } = req.params;
    if (!isUuid(ownershipId)) throwOwnershipNotFound();

    const ownership = await updateOwnership(req.user, ownershipId, parseUpdateBody(req.body));
    sendData(res, ownership);
  } catch (error) {
    next(error);
  }
};

export const postOwnershipEnd = async (req, res, next) => {
  try {
    const { ownershipId } = req.params;
    if (!isUuid(ownershipId)) throwOwnershipNotFound();

    const ownership = await endOwnership(req.user, ownershipId, parseEndBody(req.body));
    sendData(res, ownership);
  } catch (error) {
    next(error);
  }
};
