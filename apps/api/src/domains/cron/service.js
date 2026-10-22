import { prisma } from '../../platform/prismaClient.js';
import { AppError } from '../../platform/AppError.js';
import { ExternalServiceError } from '../complexes/provider/ExternalServiceError.js';
import { KaptSyncAbortError, syncKaptComplexes } from '../complexes/kaptSync.js';
import { runExternalApiHealth } from './apiHealth.js';

const UNAVAILABLE_MESSAGE = 'K-apt 단지 목록 갱신에 실패했습니다.';

// 새 K-apt 단지 기본정보 채우기는 매일 cron(/api/cron/reference-data)으로 옮겼다. 주간 cron은 목록 동기화 + 상태 점검만.
// 외부 API 상태 점검은 함수 제한 60초 중 15초 이상 남았을 때만 한다. 점검 자체가 최악 약 8초(표본 병렬, 호출당
// 타임아웃 8초) + jobs 쓰기·읽기라서, 10초로는 앞 단계가 늦게 끝났을 때 60초를 넘을 수 있다.
const CRON_BUDGET_MS = 60000;
const HEALTH_MIN_REMAINING_MS = 15000;

// 점검 실패(DB 오류 등)도 동기화 결과에 영향을 주지 않는다.
const checkExternalApis = async (startedAt) => {
  if (CRON_BUDGET_MS - (Date.now() - startedAt) < HEALTH_MIN_REMAINING_MS) {
    return { skipped: true, reason: 'time budget' };
  }
  try {
    return await runExternalApiHealth({ prisma });
  } catch (error) {
    console.error('[health] 점검 실패', error.code ?? error.name);
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
    return { ...summary, health: await checkExternalApis(startedAt) };
  } catch (error) {
    if (error instanceof ExternalServiceError || error instanceof KaptSyncAbortError) {
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', 503, UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
};
