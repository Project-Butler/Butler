import { AppError } from '../../platform/AppError.js';
import { prisma } from '../../platform/prismaClient.js';
import { assertAllowedBody } from '../../platform/requestValidation.js';
import { sendData } from '../../platform/respond.js';
import { JusoRefreshBusyError, runJusoRefreshNow } from '../cron/referenceData.js';

// POST /api/v1/admin/reference-data/juso/refresh — 관리자가 juso 참고 데이터를 지금 갱신한다(본문 없음).
// 모드(JUSO_LINK_MODE)에 맞는 경로로 밀린 날짜를 적용하고 결과 요약을 돌려준다. 실행 기록은 jobs(JUSO_REFRESH_MANUAL).
// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const refreshJusoReferenceData = async (req, res, next) => {
  try {
    assertAllowedBody(req.body ?? {}, []);
    sendData(res, await runJusoRefreshNow({ prisma, requestedBy: req.user.id }));
  } catch (error) {
    if (error instanceof JusoRefreshBusyError) {
      next(new AppError('REFERENCE_DATA_REFRESH_IN_PROGRESS', 409, '이미 갱신 중입니다. 잠시 뒤 다시 시도해 주세요.'));
      return;
    }
    next(error);
  }
};
