import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareDriftLinks, DRIFT_RELOAD_RATIO } from './jusoLinkDrift.js';

const link = (mgt, kaptCode, extra = {}) => ({
  buildingMgtNo: mgt,
  roadSigunguCd: '11350',
  roadNameKey: '섬밭로',
  roadUnderground: false,
  roadMainNo: 285,
  roadSubNo: 0,
  kaptCode,
  matchRule: 'ROAD_KEY',
  ...extra,
});

test('드리프트: 규칙 이름 차이는 무시, 단지 코드·도로명 키 차이·한쪽에만 있는 건물을 센다', () => {
  const full = new Map([
    ['B1', link('B1', 'A1')],
    ['B2', link('B2', 'A1')],
    ['B3', link('B3', 'A2')],
  ]);
  const db = [link('B1', 'A1', { matchRule: 'NON_APT_FLAG' }), link('B2', 'A9'), link('B4', 'A3')];
  const result = compareDriftLinks(full, db);
  assert.equal(result.changed, 1);
  assert.equal(result.onlyInDb, 1);
  assert.equal(result.onlyInFull, 1);
  assert.equal(result.ratio, 1);
  assert.equal(result.reloadRecommended, true);
  assert.deepEqual(result.samples, { onlyInFull: ['B3'], onlyInDb: ['B4'], changed: ['B2'] });
});

test('드리프트: 0.5% 이하면 다시 적재하지 않아도 된다', () => {
  const full = new Map(Array.from({ length: 1000 }, (_, index) => [`B${index}`, link(`B${index}`, 'A1')]));
  const db = [...full.values()].slice(0, 995);
  const result = compareDriftLinks(full, db);
  assert.equal(result.ratio, 0.005);
  assert.equal(result.reloadRecommended, false);
  assert.equal(DRIFT_RELOAD_RATIO, 0.005);
});
