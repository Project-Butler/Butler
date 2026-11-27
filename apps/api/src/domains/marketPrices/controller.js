import { sendData } from '../../platform/respond.js';
import { KEY_SHAPE_ERROR_CODES } from './marketPriceRules.js';
import { serviceKeyShape } from './rtmsProvider.js';
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
// 키 오류(30 · NO_KEY)로 실패한 묶음이 있으면 시세 응답과 같은 keyShape(길이 · 참/거짓만 — rtmsProvider serviceKeyShape)를 끝에 붙인다(11/26, #233).
// 로그를 남기는 순간의 환경 변수로 계산한다. rawKey 는 테스트용
// relinkFirst = 실행을 시작하자마자 한 다시 잇기 결과 { sigungus(시군구 수), relinked(이어진 거래 수), elapsedMs, capped(8초 상한에 걸렸나) }(#270)
// deferred = 다음 쪽을 부를 시간이 모자라 아무것도 쓰지 않고 다음 실행으로 미룬 묶음 수(실패 아님 — failures 에 없다, #272)
const LOGGED_FIELDS = ['targets', 'planned', 'backfill', 'done', 'failed', 'deferred', 'failures', 'calls', 'elapsedMs', 'relinkFirst'];
export const formatCollectionLog = (summary, rawKey = process.env.DATA_GO_KR_SERVICE_KEY) => {
  const failures = (summary.failures ?? []).slice(0, 10);
  const logged = Object.fromEntries(LOGGED_FIELDS.map((field) => [field, field === 'failures' ? failures : summary[field]]));
  // failures 한 줄의 끝이 코드("11710 2026-10 RENT 30")
  if (failures.some((line) => KEY_SHAPE_ERROR_CODES.includes(String(line).split(' ').at(-1)))) logged.keyShape = serviceKeyShape(rawKey);
  return `[market-prices] cron ${JSON.stringify(logged)}`;
};

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
