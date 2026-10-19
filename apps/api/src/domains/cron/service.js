import { prisma } from '../../platform/prismaClient.js';
import { AppError } from '../../platform/AppError.js';
import { ExternalServiceError } from '../complexes/provider/ExternalServiceError.js';
import { KaptSyncAbortError, syncKaptComplexes } from '../complexes/kaptSync.js';
import { KAPT_BASIS_CRON_LIMIT } from '../complexes/apiUsage.js';
import { fillKaptBasis } from '../complexes/kaptBasis.js';

const UNAVAILABLE_MESSAGE = 'K-apt 단지 목록 갱신에 실패했습니다.';

// 동기화 뒤 남은 시간에 기본정보가 없는 새 단지를 채운다. 함수 제한(60초) 안에 끝나도록
// cron 시작부터 40초가 지나면 새 호출을 시작하지 않는다(진행 중인 호출은 타임아웃 8초까지).
const BASIS_FILL_MAX_ROWS = 30;
const BASIS_FILL_DEADLINE_MS = 40000;

// 채우기 실패는 동기화 결과에 영향을 주지 않는다(다음 주에 다시 채운다).
const fillNewKaptBasis = async (startedAt) => {
  try {
    const summary = await fillKaptBasis({
      prisma,
      maxRows: BASIS_FILL_MAX_ROWS,
      usageLimit: KAPT_BASIS_CRON_LIMIT,
      deadlineAt: startedAt + BASIS_FILL_DEADLINE_MS,
    });
    return {
      processed: summary.processed,
      filled: summary.filled,
      failed: summary.failed + summary.notFound,
      stopReason: summary.stopReason,
    };
  } catch (error) {
    console.error('[kapt-basis] cron 채우기 실패', error.code ?? error.name);
    return { error: 'internal error' };
  }
};

// 실패하면 kaptSync가 jobs에 FAILED로 남기고 에러를 다시 던진다.
// 외부 호출 실패·비정상 응답(원본 에러에 URL·키가 섞일 수 있음)은 503 EXTERNAL_SERVICE_UNAVAILABLE로 바꿔
// errorHandler에 원본이 가지 않게 하고, DB 오류 등 그 밖의 에러는 그대로 올려 500이 되게 한다.
// Vercel Cron 로그에 실패로 보이고, 다음 주기에 다시 시도한다.
export const syncKaptComplexList = async () => {
  try {
    const startedAt = Date.now();
    const summary = await syncKaptComplexes({ prisma });
    if (summary.skipped === true) return summary;
    return { ...summary, basis: await fillNewKaptBasis(startedAt) };
  } catch (error) {
    if (error instanceof ExternalServiceError || error instanceof KaptSyncAbortError) {
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
};
