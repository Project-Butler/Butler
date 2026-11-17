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

// GET /api/cron/market-prices (cronRouter.js) — 하루 한 번. 결과 요약(건수 · 호출 수 · 시간)만 돌려준다
export const runMarketPriceCollection = async (req, res, next) => {
  try {
    sendData(res, await collectMarketPrices());
  } catch (error) {
    next(error);
  }
};
