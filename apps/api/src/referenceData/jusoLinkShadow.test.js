import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareShadowPlans, evaluateShadowStreak } from './jusoLinkShadow.js';
import { getJusoLinkMode } from './jusoLinkMode.js';

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

test('모드: 키가 없으면 항상 off, 키가 있으면 기본 shadow, 모르는 값도 shadow', () => {
  assert.equal(getJusoLinkMode({}), 'off');
  assert.equal(getJusoLinkMode({ JUSO_LINK_MODE: 'apply' }), 'off');
  assert.equal(getJusoLinkMode({ JUSO_LINK_API_KEY: 'k' }), 'shadow');
  assert.equal(getJusoLinkMode({ JUSO_LINK_API_KEY: 'k', JUSO_LINK_MODE: ' APPLY ' }), 'apply');
  assert.equal(getJusoLinkMode({ JUSO_LINK_API_KEY: 'k', JUSO_LINK_MODE: 'yes' }), 'shadow');
  assert.equal(getJusoLinkMode({ JUSO_LINK_API_KEY: '  ', JUSO_LINK_MODE: 'apply' }), 'off');
});

test('비교: 규칙 이름은 보지 않고 단지 코드·도로명 키만, 변경 없는 연산은 같음', () => {
  const existing = new Map([
    ['B1', link('B1', 'A1')],
    ['B2', link('B2', 'A1')],
  ]);
  const deltaOps = [
    { kind: 'upsert', link: link('B1', 'A1') }, // 변경 없는 34
    { kind: 'upsert', link: link('B3', 'A2') },
    { kind: 'delete', buildingMgtNo: 'B2' },
    { kind: 'upsert', link: link('B4', 'A3') }, // 동 표시에 없는 건물(사각지대)
  ];
  const linkOps = [
    { kind: 'upsert', link: link('B1', 'A1', { matchRule: 'NON_APT_FLAG' }) },
    { kind: 'upsert', link: link('B3', 'A2') },
    { kind: 'unresolved', buildingMgtNo: 'B2', reason: 'road name changed' },
  ];
  const result = compareShadowPlans({ deltaOps, linkOps, existing });
  assert.equal(result.compared, 4);
  assert.equal(result.same, 2);
  assert.equal(result.unexplained, 0);
  assert.deepEqual(result.explained, { renameUnresolved: 1, kaptInactive: 0, blindSpot: 1 });
});

test('비교: 설명되지 않는 차이는 따로 센다', () => {
  const result = compareShadowPlans({
    deltaOps: [{ kind: 'upsert', link: link('B1', 'A1') }],
    linkOps: [{ kind: 'upsert', link: link('B1', 'A9') }],
    existing: new Map(),
  });
  assert.equal(result.unexplained, 1);
  assert.equal(result.diffs[0].reason, 'unexplained');
});

test('전환 기준: incomplete는 건너뛰고 7일 연속(차이 0·unresolved 1% 미만)', () => {
  const good = { incomplete: false, compare: { unexplained: 0 }, link: { considered: 100, unresolvedCount: 0 } };
  const rows = [good, { incomplete: true }, good, good, good, good, good, good];
  assert.deepEqual(evaluateShadowStreak(rows), { streak: 7, ready: true });
  const broken = [good, good, { ...good, compare: { unexplained: 1 } }, good, good, good, good, good];
  assert.deepEqual(evaluateShadowStreak(broken), { streak: 2, ready: false });
  const unresolved = [{ ...good, link: { considered: 100, unresolvedCount: 1 } }];
  assert.deepEqual(evaluateShadowStreak(unresolved), { streak: 0, ready: false });
});
