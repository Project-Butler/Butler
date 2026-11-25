import { sendData } from '../../platform/respond.js';
import { collectMarketPrices } from './service/collect.js';
import { findComplexMarketPrices, findRegionMarketPrices } from './service/prices.js';

// GET /api/v1/market-prices/complexes/:complexId?dealType=SALE&areaMin=&areaMax=&fromYearMonth=&toYearMonth=
export const getComplexMarketPrices = async (req, res, next) => {
  try {
    sendData(res, await findComplexMarketPrices(req.user, req.params.complexId, req.query));
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/market-prices/regions/:legalDongCode?dealType=…
export const getRegionMarketPrices = async (req, res, next) => {
  try {
    sendData(res, await findRegionMarketPrices(req.user, req.params.legalDongCode, req.query));
  } catch (error) {
    next(error);
  }
};

// 정기 실행 결과 한 줄(console.info). 왜: 정기 실행의 응답은 Vercel cron 이 받고 버려서 사람이 못 본다 — 받기가 실패해도 200 으로 끝나므로
// 배포 로그에서 원인(failures 의 코드)을 보려면 로그에 남겨야 한다(11/25). 칸은 요약 중 이것만.
// failures 는 "시군구 계약월 종류 코드"(예: "11710 2026-10 RENT TIMEOUT", collect.js) — 시군구 5자리 · 달 · TRADE/RENT 는 우리가 만든 값이고
// 코드는 규칙 파일 safeErrorCode 를 거친 영문 · 숫자 · 밑줄뿐이라 요청 주소 · 키가 들어갈 자리가 없다. 수집이 통째로 실패(던짐)하면 errorHandler 가 남긴다
const LOGGED_FIELDS = ['targets', 'planned', 'backfill', 'done', 'failed', 'failures', 'calls', 'elapsedMs'];
export const formatCollectionLog = (summary) =>
  `[market-prices] cron ${JSON.stringify(Object.fromEntries(LOGGED_FIELDS.map((field) => [field, field === 'failures' ? (summary.failures ?? []).slice(0, 10) : summary[field]])))}`;

// GET /api/cron/market-prices (cronRouter.js) — 하루 한 번. 결과 요약(건수 · 호출 수 · 시간)만 돌려주고, 같은 요약을 로그에 한 줄 남긴다
export const runMarketPriceCollection = async (req, res, next) => {
  try {
    const summary = await collectMarketPrices();
    console.info(formatCollectionLog(summary));
    sendData(res, summary);
  } catch (error) {
    next(error);
  }
};
