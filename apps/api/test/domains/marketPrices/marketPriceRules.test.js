import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import cronRouter from '../../../src/domains/marketPrices/cronRouter.js';
import { REFRESH_MONTHS, KEEP_MONTHS, SCHEDULE, rentDealType } from '../../../src/domains/marketPrices/marketPriceRules.js';

describe('시세 규칙 파일', () => {
  test('SCHEDULE 경로가 cron 라우터에 걸린 경로와 같고, 일정은 한국 시간 02:00(UTC 17:00)', () => {
    const paths = cronRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
    assert.deepEqual(paths, ['/api/cron/market-prices']);
    assert.equal(SCHEDULE.path, '/api/cron/market-prices');
    assert.equal(SCHEDULE.cron, '0 17 * * *');
  });

  test('보관 12개월 · 다시 모으기 3개월 · 월세 0 이면 전세', () => {
    assert.equal(KEEP_MONTHS, 12);
    assert.equal(REFRESH_MONTHS, 3);
    assert.equal(rentDealType(0), 'JEONSE');
    assert.equal(rentDealType(1), 'MONTHLY');
  });
});
