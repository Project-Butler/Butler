import { sendData } from '../../platform/respond.js';
import { syncKaptComplexList } from './service.js';

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const runKaptComplexSync = async (req, res, next) => {
  try {
    const summary = await syncKaptComplexList();
    sendData(res, summary);
  } catch (error) {
    next(error);
  }
};
