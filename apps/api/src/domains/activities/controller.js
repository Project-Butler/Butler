import { assertSingleValues, throwIfInvalid } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { findMyActivities } from './service.js';

const DEFAULT_SIZE = 10;
const MAX_SIZE = 50;

const parseListQuery = (query) => {
  assertSingleValues(query);
  let size = DEFAULT_SIZE;
  if (query.size !== undefined) {
    size = Number(query.size);
    if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE) {
      throwIfInvalid([{ field: 'size', reason: `1 이상 ${MAX_SIZE} 이하의 정수여야 합니다.` }]);
    }
  }
  return { size };
};

// GET /activities?size=10 — 페이지 없음.
// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const listActivities = async (req, res, next) => {
  try {
    sendData(res, await findMyActivities(req.user, parseListQuery(req.query)));
  } catch (error) {
    next(error);
  }
};
