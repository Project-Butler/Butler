// 초대 규칙 단위 테스트(DB 없음). docs/11 개발 계획 2-6 "단위".
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  DAILY_FAIL_LIMIT,
  DAILY_WINDOW_MS,
  applyVerifyFailure,
  computeInvitationStatus,
  evaluateVerifyAttempt,
  generateInvitationToken,
  hashToken,
  invitationUnusableReason,
  isTokenFormat,
  isVerificationUsable,
  matchesPhoneLast4,
  phoneFingerprint,
  waitMsAfterFailures,
} from '../../../src/domains/tenantInvitations/rules.js';

const NOW = new Date('2026-11-11T03:00:00Z');
const at = (ms) => new Date(NOW.getTime() + ms);
const base = (extra = {}) => ({
  status: 'PENDING',
  expiresAt: at(86400000),
  verifyFailCount: 0,
  verifyFailWindowStart: null,
  nextVerifyAt: null,
  landlordAlertedAt: null,
  ...extra,
});
const contract = (extra = {}) => ({
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2027-12-31T00:00:00Z'),
  terminatedOn: null,
  ...extra,
});

describe('토큰', () => {
  test('24바이트 base64url(32자), 해시는 sha256 hex', () => {
    const token = generateInvitationToken();
    assert.match(token, /^[A-Za-z0-9_-]{32}$/);
    assert.ok(isTokenFormat(token));
    assert.equal(hashToken(token), createHash('sha256').update(token).digest('hex'));
    assert.notEqual(generateInvitationToken(), token);
  });

  test('형식이 아닌 토큰', () => {
    for (const value of ['', 'short', 'a'.repeat(129), 'has space here....', null, 123]) assert.equal(isTokenFormat(value), false);
  });
});

describe('휴대폰 뒤 4자리', () => {
  test('계약 번호 뒤 4자리와만 맞는다', () => {
    assert.equal(matchesPhoneLast4('01098765432', '5432'), true);
    assert.equal(matchesPhoneLast4('01098765432', '5433'), false);
    assert.equal(matchesPhoneLast4('01098765432', '543'), false);
    assert.equal(matchesPhoneLast4('01098765432', 5432), false);
    assert.equal(matchesPhoneLast4(null, '5432'), false);
  });

  test('지문은 계약 id + 번호', () => {
    assert.equal(phoneFingerprint('c1', '010'), createHash('sha256').update('c1010').digest('hex'));
    assert.notEqual(phoneFingerprint('c1', '01011112222'), phoneFingerprint('c1', '01011113333'));
  });
});

describe('대기 계산', () => {
  test('3회부터 30초 → 2분 → 10분(이후 10분)', () => {
    assert.equal(waitMsAfterFailures(0), 0);
    assert.equal(waitMsAfterFailures(2), 0);
    assert.equal(waitMsAfterFailures(3), 30_000);
    assert.equal(waitMsAfterFailures(4), 120_000);
    assert.equal(waitMsAfterFailures(5), 600_000);
    assert.equal(waitMsAfterFailures(14), 600_000);
  });

  test('실패를 쌓으면 3번째부터 다음 시도 시각이 생긴다', () => {
    let invitation = base();
    const counts = [];
    for (let index = 0; index < 4; index += 1) {
      const next = applyVerifyFailure(invitation, NOW);
      counts.push([next.verifyFailCount, next.nextVerifyAt ? next.nextVerifyAt.getTime() - NOW.getTime() : 0]);
      invitation = { ...invitation, ...next };
    }
    assert.deepEqual(counts, [[1, 0], [2, 0], [3, 30_000], [4, 120_000]]);
  });

  test('대기 중이면 WAIT, 시각이 지나면 ALLOWED', () => {
    assert.deepEqual(evaluateVerifyAttempt(base({ nextVerifyAt: at(30_000) }), NOW), { kind: 'WAIT', retryAfterSeconds: 30 });
    assert.deepEqual(evaluateVerifyAttempt(base({ nextVerifyAt: at(-1) }), NOW), { kind: 'ALLOWED' });
  });
});

describe('하루 한도', () => {
  test('창 안에서 15회면 창이 끝날 때까지 DAILY_LIMIT', () => {
    const invitation = base({ verifyFailCount: DAILY_FAIL_LIMIT, verifyFailWindowStart: at(-3600_000), nextVerifyAt: at(-1) });
    const result = evaluateVerifyAttempt(invitation, NOW);
    assert.equal(result.kind, 'DAILY_LIMIT');
    assert.equal(result.retryAfterSeconds, (DAILY_WINDOW_MS - 3600_000) / 1000);
  });

  test('창이 지나면 실패 수를 새로 센다', () => {
    const invitation = base({ verifyFailCount: DAILY_FAIL_LIMIT, verifyFailWindowStart: at(-DAILY_WINDOW_MS), nextVerifyAt: null });
    assert.deepEqual(evaluateVerifyAttempt(invitation, NOW), { kind: 'ALLOWED' });
    const next = applyVerifyFailure(invitation, NOW);
    assert.equal(next.verifyFailCount, 1);
    assert.equal(next.verifyFailWindowStart, NOW);
    assert.equal(next.reachedDailyLimit, false);
  });

  test('15번째 실패에서 한도에 닿고, 임대인 알림은 창마다 한 번', () => {
    const invitation = base({ verifyFailCount: DAILY_FAIL_LIMIT - 1, verifyFailWindowStart: at(-60_000) });
    const next = applyVerifyFailure(invitation, NOW);
    assert.equal(next.verifyFailCount, DAILY_FAIL_LIMIT);
    assert.equal(next.reachedDailyLimit, true);
    assert.equal(next.shouldAlertLandlord, true);
    assert.equal(applyVerifyFailure({ ...invitation, landlordAlertedAt: at(-30_000) }, NOW).shouldAlertLandlord, false);
    // 지난 창에서 보낸 알림은 이번 창에 영향이 없다
    assert.equal(applyVerifyFailure({ ...invitation, landlordAlertedAt: at(-DAILY_WINDOW_MS * 2) }, NOW).shouldAlertLandlord, true);
  });
});

describe('쓸 수 있는 초대', () => {
  const opts = (extra = {}) => ({ contract: contract(), ownershipEnded: false, now: NOW, todayKST: '2026-11-11', ...extra });
  test('통일 에러 코드', () => {
    assert.equal(invitationUnusableReason(null, opts()), 'INVITATION_INVALID');
    assert.equal(invitationUnusableReason(base(), opts()), null);
    assert.equal(invitationUnusableReason(base({ status: 'ACCEPTED' }), opts()), 'INVITATION_ALREADY_ACCEPTED');
    assert.equal(invitationUnusableReason(base({ status: 'CANCELED' }), opts()), 'INVITATION_EXPIRED');
    assert.equal(invitationUnusableReason(base({ expiresAt: NOW }), opts()), 'INVITATION_EXPIRED');
    assert.equal(invitationUnusableReason(base(), opts({ ownershipEnded: true })), 'INVITATION_EXPIRED');
    assert.equal(invitationUnusableReason(base(), opts({ contract: contract({ terminatedOn: new Date('2026-10-01T00:00:00Z') }) })), 'INVITATION_EXPIRED');
    assert.equal(invitationUnusableReason(base(), opts({ todayKST: '2028-01-01' })), 'INVITATION_EXPIRED');
  });

  test('R-14 계산 상태', () => {
    assert.equal(computeInvitationStatus(base(), NOW), 'PENDING');
    assert.equal(computeInvitationStatus(base({ expiresAt: NOW }), NOW), 'EXPIRED');
    assert.equal(computeInvitationStatus(base({ status: 'ACCEPTED', expiresAt: at(-1) }), NOW), 'ACCEPTED');
  });
});

describe('확인 세션 판정', () => {
  const row = (extra = {}) => ({ invitationId: 'i1', revokedAt: null, expiresAt: at(60_000), phoneFingerprint: 'fp', ...extra });
  const ctx = { invitationId: 'i1', fingerprint: 'fp', now: NOW };
  test('미폐기·미만료·같은 초대·같은 번호일 때만', () => {
    assert.equal(isVerificationUsable(row(), ctx), true);
    assert.equal(isVerificationUsable(null, ctx), false);
    assert.equal(isVerificationUsable(row({ invitationId: 'i2' }), ctx), false);
    assert.equal(isVerificationUsable(row({ revokedAt: NOW }), ctx), false);
    assert.equal(isVerificationUsable(row({ expiresAt: NOW }), ctx), false);
    assert.equal(isVerificationUsable(row({ phoneFingerprint: 'other' }), ctx), false);
  });
});
