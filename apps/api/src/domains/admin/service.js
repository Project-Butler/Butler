import { AppError } from '../../platform/AppError.js';
import { prisma } from '../../platform/prismaClient.js';
import { runKaptBasisRefreshNow } from '../../referenceData/kaptExcelRefresh.js';
import { ImportAlreadyRunningError } from '../../referenceData/referenceImports.js';
import { JusoRefreshBusyError, runJusoRefreshNow } from '../cron/referenceData.js';

const toRefreshBusyError = () => new AppError('REFERENCE_DATA_REFRESH_IN_PROGRESS', 409, '이미 갱신 중입니다. 잠시 뒤 다시 시도해 주세요.');

// juso 참고 데이터 즉시 갱신. 공식 연계 API로 밀린 날짜를 적용하고 결과 요약을 돌려준다.
// 실행 기록은 jobs(JUSO_REFRESH_MANUAL). 이미 갱신 중이면 409.
export const refreshJusoReferenceData = async (user) => {
  try {
    return await runJusoRefreshNow({ prisma, requestedBy: user.id });
  } catch (error) {
    if (error instanceof JusoRefreshBusyError) throw toRefreshBusyError();
    throw error;
  }
};

// K-apt 기본정보 엑셀 즉시 갱신. 이미 넣은 날짜면 받지 않고 끝난다. 실행 기록은 jobs(KAPT_BASIS_REFRESH_MANUAL). 이미 갱신 중이면 409.
export const refreshKaptReferenceData = async (user) => {
  try {
    return await runKaptBasisRefreshNow({ prisma, requestedBy: user.id });
  } catch (error) {
    if (error instanceof ImportAlreadyRunningError) throw toRefreshBusyError();
    throw error;
  }
};
