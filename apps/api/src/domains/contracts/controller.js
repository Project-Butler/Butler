// 계약 요청 형식 검사(R-01)와 응답. 상태에 따른 규칙은 service.js.
import { AppError } from '../../platform/AppError.js';
import {
  CONTRACT_EDITABLE_FIELDS,
  CONTRACT_STATUSES,
  LEASE_TYPES,
  isValidDateString,
  normalizeTenantPhone,
} from '../../platform/contractRules.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { createContract, findContractForUser, findContracts, terminateContract, updateContract } from './service.js';

const CREATE_FIELDS = ['ownershipId', ...CONTRACT_EDITABLE_FIELDS, 'previousContractId'];
const TERMINATE_FIELDS = ['terminatedOn', 'reason'];
const MAX_TENANT_NAME_LENGTH = 30;
const MAX_MEMO_LENGTH = 1000;
const MAX_REASON_LENGTH = 200;
const SORT_PATTERN = /^(endDate|startDate|createdAt):(asc|desc)$/;

const throwContractNotFound = () => {
  throw new AppError('CONTRACT_NOT_FOUND', 404, '계약을 찾을 수 없습니다.');
};

// 칸마다 형식만 본다. 값이 맞으면 저장할 모양으로 바꿔 data에 넣는다.
const FIELD_PARSERS = {
  leaseType: (value, details) => {
    if (LEASE_TYPES.includes(value)) return value;
    details.push({ field: 'leaseType', reason: 'MONTHLY 또는 JEONSE여야 합니다.' });
    return undefined;
  },
  deposit: (value, details) => parseMoney('deposit', value, details),
  monthlyRent: (value, details) => parseMoney('monthlyRent', value, details),
  startDate: (value, details) => parseDate('startDate', value, details),
  endDate: (value, details) => parseDate('endDate', value, details),
  tenantName: (value, details) => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name.length >= 1 && name.length <= MAX_TENANT_NAME_LENGTH) return name;
    details.push({ field: 'tenantName', reason: `1~${MAX_TENANT_NAME_LENGTH}자여야 합니다.` });
    return undefined;
  },
  tenantPhone: (value, details) => {
    const phone = normalizeTenantPhone(value);
    if (phone) return phone;
    details.push({ field: 'tenantPhone', reason: 'INVALID_PHONE' });
    return undefined;
  },
  memo: (value, details) => {
    if (value === null) return null;
    if (typeof value === 'string' && value.length <= MAX_MEMO_LENGTH) return value.trim() || null;
    details.push({ field: 'memo', reason: `${MAX_MEMO_LENGTH}자 이하 문자열이어야 합니다.` });
    return undefined;
  },
};

// 원 단위 정수 → DB bigint
function parseMoney(field, value, details) {
  if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  details.push({ field, reason: '0 이상의 정수여야 합니다.' });
  return undefined;
}

function parseDate(field, value, details) {
  if (isValidDateString(value)) return value;
  details.push({ field, reason: '2000-01-01~2099-12-31 사이의 YYYY-MM-DD 날짜여야 합니다.' });
  return undefined;
}

const parseFields = (body, fields, details) => {
  const data = {};
  for (const field of fields) {
    if (body[field] !== undefined) data[field] = FIELD_PARSERS[field](body[field], details);
  }
  return data;
};

const parseCreateBody = (body) => {
  assertAllowedBody(body, CREATE_FIELDS);
  const details = [];
  const required = ['ownershipId', 'leaseType', 'deposit', 'monthlyRent', 'startDate', 'endDate', 'tenantName', 'tenantPhone'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) details.push({ field, reason: '필수 값입니다.' });
  }
  throwIfInvalid(details);

  if (!isUuid(body.ownershipId)) details.push({ field: 'ownershipId', reason: 'UUID여야 합니다.' });
  const previousContractId = body.previousContractId ?? null;
  if (previousContractId !== null && !isUuid(previousContractId)) {
    details.push({ field: 'previousContractId', reason: 'UUID여야 합니다.' });
  }
  const data = parseFields(body, CONTRACT_EDITABLE_FIELDS, details);
  throwIfInvalid(details);
  return { ownershipId: body.ownershipId, previousContractId, memo: null, ...data };
};

const parseUpdateBody = (body) => {
  assertAllowedBody(body, CONTRACT_EDITABLE_FIELDS);
  if (Object.keys(body).length === 0) {
    throw new AppError('VALIDATION_ERROR', 400, '수정할 값이 없습니다.', [
      { field: 'body', reason: `${CONTRACT_EDITABLE_FIELDS.join(', ')} 중 하나 이상이 필요합니다.` },
    ]);
  }
  const details = [];
  // memo 말고는 null로 비울 수 없는 필수 칸이다.
  for (const field of CONTRACT_EDITABLE_FIELDS) {
    if (field !== 'memo' && body[field] === null) details.push({ field, reason: '비울 수 없습니다.' });
  }
  throwIfInvalid(details);
  const data = parseFields(body, CONTRACT_EDITABLE_FIELDS, details);
  throwIfInvalid(details);
  return data;
};

const parseTerminateBody = (body) => {
  const input = body ?? {};
  assertAllowedBody(input, TERMINATE_FIELDS);
  const details = [];
  const terminatedOn = parseDate('terminatedOn', input.terminatedOn, details);
  let reason = null;
  if (input.reason !== undefined && input.reason !== null) {
    if (typeof input.reason === 'string' && input.reason.length <= MAX_REASON_LENGTH) reason = input.reason.trim() || null;
    else details.push({ field: 'reason', reason: `${MAX_REASON_LENGTH}자 이하 문자열이어야 합니다.` });
  }
  throwIfInvalid(details);
  return { terminatedOn, reason };
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  for (const field of ['propertyId', 'ownershipId']) {
    if (query[field] !== undefined && !isUuid(query[field])) details.push({ field, reason: 'UUID여야 합니다.' });
  }
  const statuses = query.status ? query.status.split(',').map((status) => status.trim()) : [];
  if (statuses.some((status) => !CONTRACT_STATUSES.includes(status))) {
    details.push({ field: 'status', reason: `${CONTRACT_STATUSES.join(', ')} 중에서 쉼표로 고릅니다.` });
  }
  const sortMatch = SORT_PATTERN.exec(query.sort ?? 'endDate:asc');
  if (!sortMatch) details.push({ field: 'sort', reason: 'endDate|startDate|createdAt:asc|desc 형식이어야 합니다.' });
  const { page, size } = parsePagination(query, details);
  throwIfInvalid(details);

  return {
    propertyId: query.propertyId ?? null,
    ownershipId: query.ownershipId ?? null,
    statuses,
    sort: { field: sortMatch[1], direction: sortMatch[2] },
    page,
    size,
  };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const postContract = async (req, res, next) => {
  try {
    sendData(res, await createContract(req.user, parseCreateBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const listContracts = async (req, res, next) => {
  try {
    const { items, meta } = await findContracts(req.user, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const getContract = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    const contract = isUuid(contractId) ? await findContractForUser(req.user, contractId) : null;
    if (!contract) throwContractNotFound();
    sendData(res, contract);
  } catch (error) {
    next(error);
  }
};

export const patchContract = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    if (!isUuid(contractId)) throwContractNotFound();
    sendData(res, await updateContract(req.user, contractId, parseUpdateBody(req.body)));
  } catch (error) {
    next(error);
  }
};

export const postContractTermination = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    if (!isUuid(contractId)) throwContractNotFound();
    sendData(res, await terminateContract(req.user, contractId, parseTerminateBody(req.body)));
  } catch (error) {
    next(error);
  }
};
