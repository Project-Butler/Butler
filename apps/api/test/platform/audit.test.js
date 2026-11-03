import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audit, stripSensitive } from '../../src/platform/audit.js';

// client.auditLog.create에 넘어간 data를 그대로 돌려주는 가짜 client
const fakeClient = () => ({ auditLog: { create: async ({ data }) => data } });

test('비밀번호·토큰·연락처 키를 중첩 객체와 배열 안까지 뺀다', () => {
  const result = stripSensitive({
    name: '김민수',
    passwordHash: 'x',
    phone: '01012345678',
    contract: { tenantPhone: '01000000000', monthlyRent: 800000 },
    sessions: [{ refreshTokenHash: 'y', ip: '203.0.113.10' }],
  });
  assert.deepEqual(result, { name: '김민수', contract: { monthlyRent: 800000 }, sessions: [{ ip: '203.0.113.10' }] });
});

test('actor가 있으면 USER, req의 requestId·ip를 같이 남긴다', async () => {
  const data = await audit.record({
    actor: { id: '00000000-0000-4000-8000-000000000003', role: 'ADMIN' },
    action: 'USER_STATUS_CHANGED',
    resourceType: 'USER',
    resourceId: '00000000-0000-4000-8000-000000000001',
    before: { status: 'ACTIVE' },
    after: { status: 'SUSPENDED' },
    req: { requestId: '11111111-1111-4111-8111-111111111111', ip: '203.0.113.10' },
    client: fakeClient(),
  });
  assert.equal(data.actorType, 'USER');
  assert.equal(data.actorId, '00000000-0000-4000-8000-000000000003');
  assert.equal(data.requestId, '11111111-1111-4111-8111-111111111111');
  assert.equal(data.ip, '203.0.113.10');
  assert.deepEqual(data.after, { status: 'SUSPENDED' });
});

test('actor가 없으면 SYSTEM, 비어 있는 값은 null·undefined로 남긴다', async () => {
  const data = await audit.record({ action: 'JOB_RETRIED', resourceType: 'JOB', client: fakeClient() });
  assert.equal(data.actorType, 'SYSTEM');
  assert.equal(data.actorId, null);
  assert.equal(data.resourceId, null);
  assert.equal(data.requestId, null);
  assert.equal(data.before, undefined);
});

test('before/after의 BigInt는 문자열로 바꾼다', async () => {
  const data = await audit.record({
    action: 'CONTRACT_UPDATED',
    resourceType: 'CONTRACT',
    before: { monthlyRent: 800000n },
    client: fakeClient(),
  });
  assert.deepEqual(data.before, { monthlyRent: '800000' });
});
