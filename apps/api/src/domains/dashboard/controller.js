import { sendData } from '../../platform/respond.js';
import { findLandlordSetup } from './service.js';

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const getLandlordSetup = async (req, res, next) => {
  try {
    sendData(res, await findLandlordSetup(req.user));
  } catch (error) {
    next(error);
  }
};
