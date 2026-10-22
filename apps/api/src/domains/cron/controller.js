import { prisma } from '../../platform/prismaClient.js';
import { sendData } from '../../platform/respond.js';
import { runReferenceDataCron } from './referenceData.js';
import { syncKaptComplexList } from './service.js';

// 모듈 로드 시각. 콜드 스타트 직후 첫 cron 호출만 이 시각을 시간 예산 기준으로 쓴다(referenceData.js).
const BOOT_AT = Date.now();
let coldStartPending = true;

// Express 4는 async 핸들러의 에러를 자동으로 넘기지 않아서 next(error)로 넘긴다.
export const runKaptComplexSync = async (req, res, next) => {
  try {
    const summary = await syncKaptComplexList();
    sendData(res, summary);
  } catch (error) {
    next(error);
  }
};

// 시간 예산은 요청이 핸들러에 들어온 시각 t0부터 잰다(데워진 인스턴스에서도 마감이 맞게).
export const runReferenceData = async (req, res, next) => {
  const t0 = Date.now();
  const coldStart = coldStartPending;
  coldStartPending = false;
  try {
    sendData(res, await runReferenceDataCron({ prisma, t0, bootAt: BOOT_AT, coldStart }));
  } catch (error) {
    next(error);
  }
};
