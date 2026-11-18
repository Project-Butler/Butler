// 일정 조회 요청 검사와 응답(api-contract.md 7장, #161).
import { AppError } from '../../platform/AppError.js';
import { isValidDateString } from '../../platform/contractRules.js';
import { compareDateStrings, daysBetween } from '../../platform/dateUtils.js';
import { assertSingleValues, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { findMySchedules } from './service.js';

// 조회 기간은 양끝 포함 최대 93일(분기 하나 + 여유).
export const MAX_SCHEDULE_RANGE_DAYS = 93;

export const parseRangeQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  for (const field of ['fromDate', 'toDate']) {
    if (!isValidDateString(query[field])) details.push({ field, reason: '필수 값이며 YYYY-MM-DD 날짜여야 합니다.' });
  }
  throwIfInvalid(details);
  const { fromDate, toDate } = query;
  if (compareDateStrings(fromDate, toDate) > 0) throwIfInvalid([{ field: 'toDate', reason: 'fromDate 이후여야 합니다.' }]);
  if (daysBetween(fromDate, toDate) + 1 > MAX_SCHEDULE_RANGE_DAYS) {
    throw new AppError('SCHEDULE_RANGE_TOO_LONG', 422, `일정은 한 번에 ${MAX_SCHEDULE_RANGE_DAYS}일까지 조회할 수 있습니다.`);
  }
  return { fromDate, toDate };
};

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
// 페이지 없는 목록이라 { data: [...] }로 답한다.
export const listSchedules = async (req, res, next) => {
  try {
    sendData(res, await findMySchedules(req.user, parseRangeQuery(req.query)));
  } catch (error) {
    next(error);
  }
};
