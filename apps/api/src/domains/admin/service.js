import { AppError } from '../../platform/AppError.js';
import { prisma } from '../../platform/prismaClient.js';
import { JusoRefreshBusyError, runJusoRefreshNow } from '../cron/referenceData.js';

// juso 참고 데이터 즉시 갱신. 모드(JUSO_LINK_MODE)에 맞는 경로로 밀린 날짜를 적용하고 결과 요약을 돌려준다.
// 실행 기록은 jobs(JUSO_REFRESH_MANUAL). 이미 갱신 중이면 409.
export const refreshJusoReferenceData = async (user) => {
  try {
    return await runJusoRefreshNow({ prisma, requestedBy: user.id });
  } catch (error) {
    if (error instanceof JusoRefreshBusyError) {
      throw new AppError('REFERENCE_DATA_REFRESH_IN_PROGRESS', 409, '이미 갱신 중입니다. 잠시 뒤 다시 시도해 주세요.');
    }
    throw error;
  }
};
