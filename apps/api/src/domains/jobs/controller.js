import { AppError } from '../../platform/AppError.js';
import { sendData } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import { findJobForUser } from './service.js';

// GET /api/v1/jobs/:jobId — 형식이 틀린 id·없는 작업·남의 작업은 모두 같은 404로 존재를 숨긴다.
// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const getJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = isUuid(jobId) ? await findJobForUser(req.user, jobId) : null;
    if (!job) throw new AppError('JOB_NOT_FOUND', 404, '작업을 찾을 수 없습니다.');
    sendData(res, job);
  } catch (error) {
    next(error);
  }
};
