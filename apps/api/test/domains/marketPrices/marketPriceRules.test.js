import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import cronRouter from '../../../src/domains/marketPrices/cronRouter.js';
import { REFRESH_MONTHS, KEEP_MONTHS, SCHEDULE, areaRange, rentDealType } from '../../../src/domains/marketPrices/marketPriceRules.js';

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

  test('보관 12개월 · 다시 모으기 3개월 · 월세 0 이면 전세', () => {
    assert.equal(KEEP_MONTHS, 12);
    assert.equal(REFRESH_MONTHS, 3);
    assert.equal(rentDealType(0), 'JEONSE');
    assert.equal(rentDealType(1), 'MONTHLY');
  });
});
