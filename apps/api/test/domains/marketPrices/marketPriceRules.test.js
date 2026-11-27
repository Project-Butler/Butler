import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import cronRouter from '../../../src/domains/marketPrices/cronRouter.js';
import {
  CONCURRENCY,
  KEEP_MONTHS,
  NEXT_PAGE_NEEDS_MS,
  REFRESH_MONTHS,
  REQUEST_TIMEOUT_MS,
  RETRY_CODES,
  RETRY_DELAY_MS,
  RETRY_LIMIT,
  RUN_BUDGET_MS,
  SCHEDULE,
  areaRange,
  rentDealType,
  safeErrorCode,
} from '../../../src/domains/marketPrices/marketPriceRules.js';

describe('시세 규칙 파일', () => {
  test('SCHEDULE 경로가 cron 라우터에 걸린 경로와 같고, 일정은 한국 시간 02:00(UTC 17:00)', () => {
    const paths = cronRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
    assert.deepEqual(paths, ['/api/cron/market-prices']);
    assert.equal(SCHEDULE.path, '/api/cron/market-prices');
    assert.equal(SCHEDULE.cron, '0 17 * * *');
  });

  test('면적 구간: areaMin < 전용면적 ≤ areaMax, 없는 쪽은 제한 없음', () => {
    assert.deepEqual(areaRange(60, 85), { gt: 60, lte: 85 });
    assert.deepEqual(areaRange(null, 60), { lte: 60 });
    assert.deepEqual(areaRange(105, null), { gt: 105 });
    assert.deepEqual(areaRange(null, null), {});
    // 경계 60 · 85 · 105㎡ 는 한 칸에만: 화면 칩(60 이하 · 60–85 · 85–105 · 105 초과)
    const bands = [areaRange(null, 60), areaRange(60, 85), areaRange(85, 105), areaRange(105, null)];
    const inRange = (area, range) => (range.gt === undefined || area > range.gt) && (range.lte === undefined || area <= range.lte);
    for (const [area, band] of [[60, 0], [85, 1], [105, 2], [59.99, 0], [60.01, 1], [105.01, 3]]) {
      assert.deepEqual(bands.map((range) => inRange(area, range)), bands.map((_, index) => index === band), `${area}㎡`);
    }
  });

  test('보관 13개월 · 다시 모으기 3개월 · 월세 0 이면 전세', () => {
    assert.equal(KEEP_MONTHS, 13);
    assert.equal(REFRESH_MONTHS, 3);
    assert.equal(rentDealType(0), 'JEONSE');
    assert.equal(rentDealType(1), 'MONTHLY');
  });

  test('하나씩 부르고, 시간 초과 · 23 만 1 ~ 2초 쉬고 한 번 더 — 다시 시도 한 번이 실행 한도 안에 든다', () => {
    assert.equal(CONCURRENCY, 1);
    assert.deepEqual([...RETRY_CODES].sort(), ['23', 'TIMEOUT']);
    assert.equal(RETRY_LIMIT, 1);
    assert.ok(RETRY_DELAY_MS >= 1000 && RETRY_DELAY_MS <= 2000);
    assert.ok(REQUEST_TIMEOUT_MS + RETRY_DELAY_MS + REQUEST_TIMEOUT_MS < RUN_BUDGET_MS);
  });

  test('다음 쪽은 요청 하나 몫(8초)이 남을 때만 — 새 묶음을 시작하는 조건과 같은 값 (#272)', () => {
    assert.equal(NEXT_PAGE_NEEDS_MS, REQUEST_TIMEOUT_MS);
    assert.ok(NEXT_PAGE_NEEDS_MS < RUN_BUDGET_MS);
  });

  test('실패 코드: 영문 · 숫자 · 밑줄 30자만 그대로, 주소 · 키 글자가 섞이면 UNKNOWN', () => {
    for (const code of ['30', '23', 'NO_KEY', 'TIMEOUT', 'NETWORK', 'HTTP_502', 'TOO_MANY_PAGES', 'P2021', 'TypeError']) assert.equal(safeErrorCode(code), code);
    assert.equal(safeErrorCode('PrismaClientInitializationError'), 'PrismaClientInitializationErro'); // 칸 길이 30
    for (const leak of [
      'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent?serviceKey=abc',
      'serviceKey=abc%2Bdef',
      'abc+def/ghi==',
      'SERVICE ERROR',
      '',
      null,
      undefined,
    ]) {
      assert.equal(safeErrorCode(leak), 'UNKNOWN', String(leak));
    }
  });
});
