import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSetupSteps } from './setupProgress.js';

test('진행률: 아무것도 없으면 0%', () => {
  const { progress, steps } = buildSetupSteps({ buildingCount: 0, propertyCount: 0 });
  assert.equal(progress, 0);
  assert.deepEqual(
    steps.map((step) => step.key),
    ['BUILDING', 'PROPERTY', 'CONTRACT', 'TENANT_INVITE', 'OPERATION_CHECK'],
  );
});

test('진행률: 건물만 있으면 20%, 호실이 1개 이상이면 STEP2 완료 40%', () => {
  assert.equal(buildSetupSteps({ buildingCount: 3, propertyCount: 0 }).progress, 20);

  // 건물 3개 중 1개에만 호실이 있어도 STEP2 완료(Landly 관찰 Q12)
  const { progress, steps } = buildSetupSteps({ buildingCount: 3, propertyCount: 1 });
  assert.equal(progress, 40);
  assert.deepEqual(steps[1], { key: 'PROPERTY', done: true, count: 1 });
});

test('STEP3·4는 아직 쓸 수 없고 STEP5는 잠김', () => {
  const { steps } = buildSetupSteps({ buildingCount: 1, propertyCount: 1 });
  assert.deepEqual(steps[2], { key: 'CONTRACT', done: false, count: 0, available: false });
  assert.deepEqual(steps[3], { key: 'TENANT_INVITE', done: false, count: 0, available: false });
  assert.deepEqual(steps[4], { key: 'OPERATION_CHECK', done: false, locked: true });
});
