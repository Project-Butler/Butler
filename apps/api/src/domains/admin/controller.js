import { assertAllowedBody } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { refreshJusoReferenceData, refreshKaptReferenceData } from './service.js';

// POST /api/v1/admin/reference-data/juso/refresh — 관리자가 juso 참고 데이터를 지금 갱신한다(본문 없음).
// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const refreshJuso = async (req, res, next) => {
  try {
    assertAllowedBody(req.body ?? {}, []);
    sendData(res, await refreshJusoReferenceData(req.user));
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/reference-data/kapt/refresh — 관리자가 K-apt 최신 기본정보 엑셀을 지금 넣는다(본문 없음).
export const refreshKapt = async (req, res, next) => {
  try {
    assertAllowedBody(req.body ?? {}, []);
    sendData(res, await refreshKaptReferenceData(req.user));
  } catch (error) {
    next(error);
  }
};
