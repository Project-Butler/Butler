import { prisma } from '../../platform/prismaClient.js';
import { AppError } from '../../platform/AppError.js';
import { ExternalServiceError } from '../complexes/provider/ExternalServiceError.js';
import { KaptSyncAbortError, syncKaptComplexes } from '../complexes/kaptSync.js';

const UNAVAILABLE_MESSAGE = 'K-apt 단지 목록 갱신에 실패했습니다.';

// 실패하면 kaptSync가 jobs에 FAILED로 남기고 에러를 다시 던진다.
// 외부 호출 실패·비정상 응답(원본 에러에 URL·키가 섞일 수 있음)은 503 EXTERNAL_SERVICE_UNAVAILABLE로 바꿔
// errorHandler에 원본이 가지 않게 하고, DB 오류 등 그 밖의 에러는 그대로 올려 500이 되게 한다.
// Vercel Cron 로그에 실패로 보이고, 다음 주기에 다시 시도한다.
export const syncKaptComplexList = async () => {
  try {
    return await syncKaptComplexes({ prisma });
  } catch (error) {
    if (error instanceof ExternalServiceError || error instanceof KaptSyncAbortError) {
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
};
