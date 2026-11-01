import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertUserStatusChangeAllowed } from './userStatusChange.js';

const actor = { id: 'admin-1', role: 'ADMIN' };
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};

test('일반 회원은 바꿀 수 있다', () => {
  assert.equal(code(() => assertUserStatusChangeAllowed(actor, { id: 'u1', role: 'LANDLORD', status: 'ACTIVE' })), null);
  assert.equal(code(() => assertUserStatusChangeAllowed(actor, { id: 'u2', role: 'TENANT', status: 'SUSPENDED' })), null);
});

test('자기 자신·ADMIN·탈퇴 계정은 422', () => {
  const expected = 'USER_STATUS_CHANGE_NOT_ALLOWED';
  assert.equal(code(() => assertUserStatusChangeAllowed(actor, { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE' })), expected);
  assert.equal(code(() => assertUserStatusChangeAllowed(actor, { id: 'admin-2', role: 'ADMIN', status: 'ACTIVE' })), expected);
  assert.equal(code(() => assertUserStatusChangeAllowed(actor, { id: 'u3', role: 'LANDLORD', status: 'WITHDRAWN' })), expected);
});
