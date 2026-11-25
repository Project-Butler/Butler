import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNeverVerifiedOwnership } from '../../src/platform/ownershipEnd.js';

const NEVER = { firstVerifiedAt: null, verifiedAt: null, verificationStatus: 'UNVERIFIED' };

test('H-37 삭제 조건: 세 칸이 모두 인증 전일 때만 true', () => {
  assert.equal(isNeverVerifiedOwnership(NEVER), true);
});

test('H-37 삭제 조건: 인증한 흔적이 하나라도 있으면 false(기록 보존)', () => {
  const at = new Date('2026-01-01T00:00:00Z');
  assert.equal(isNeverVerifiedOwnership({ ...NEVER, firstVerifiedAt: at }), false);
  assert.equal(isNeverVerifiedOwnership({ ...NEVER, verifiedAt: at }), false);
  assert.equal(isNeverVerifiedOwnership({ ...NEVER, verificationStatus: 'VERIFIED' }), false);
  assert.equal(isNeverVerifiedOwnership({ ...NEVER, verificationStatus: 'REVOKED' }), false);
});

test('H-37 삭제 조건: 칸을 읽지 않아 undefined면 false', () => {
  assert.equal(isNeverVerifiedOwnership({ verificationStatus: 'UNVERIFIED' }), false);
  assert.equal(isNeverVerifiedOwnership({ ...NEVER, verifiedAt: undefined }), false);
  assert.equal(isNeverVerifiedOwnership({ ...NEVER, firstVerifiedAt: undefined }), false);
});
