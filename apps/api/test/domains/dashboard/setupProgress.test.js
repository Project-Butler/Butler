import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSetupSteps } from '../../../src/domains/dashboard/setupProgress.js';

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

test('계약이 1건 이상이면 STEP2 완료 50%', () => {
  const { progress, steps } = buildSetupSteps({ propertyCount: 1, contractCount: 2 });
  assert.equal(progress, 50);
  assert.deepEqual(steps[1], { key: 'CONTRACT', done: true, count: 2 });
});

test('수락된 초대가 1건 이상이면 STEP3 완료 75%', () => {
  const { progress, steps } = buildSetupSteps({ propertyCount: 1, contractCount: 1, acceptedInvitationCount: 2 });
  assert.equal(progress, 75);
  assert.deepEqual(steps[2], { key: 'TENANT_INVITE', done: true, count: 2 });
});

test('STEP3은 수락 전까지 미완료이고 STEP4는 잠김', () => {
  const { steps } = buildSetupSteps({ propertyCount: 1 });
  assert.deepEqual(steps[1], { key: 'CONTRACT', done: false, count: 0 });
  assert.deepEqual(steps[2], { key: 'TENANT_INVITE', done: false, count: 0 });
  assert.deepEqual(steps[3], { key: 'OPERATION_CHECK', done: false, locked: true });
});
