import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSetupSteps } from './setupProgress.js';

test('진행률: 아무것도 없으면 0%', () => {
  const { progress, steps } = buildSetupSteps({ propertyCount: 0 });
  assert.equal(progress, 0);
  assert.deepEqual(
    steps.map((step) => step.key),
    ['PROPERTY', 'CONTRACT', 'TENANT_INVITE', 'OPERATION_CHECK'],
  );
});

test('진행률: 호실이 1개 이상이면 STEP1 완료 25%', () => {
  const { progress, steps } = buildSetupSteps({ propertyCount: 1 });
  assert.equal(progress, 25);
  assert.deepEqual(steps[0], { key: 'PROPERTY', done: true, count: 1 });
});

test('STEP2·3은 아직 쓸 수 없고 STEP4는 잠김', () => {
  const { steps } = buildSetupSteps({ propertyCount: 1 });
  assert.deepEqual(steps[1], { key: 'CONTRACT', done: false, count: 0, available: false });
  assert.deepEqual(steps[2], { key: 'TENANT_INVITE', done: false, count: 0, available: false });
  assert.deepEqual(steps[3], { key: 'OPERATION_CHECK', done: false, locked: true });
});
