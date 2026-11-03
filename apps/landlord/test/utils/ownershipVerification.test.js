import { describe, expect, it } from 'vitest';
import { buildLocation, resolveViewKey } from '../../src/routes';
import { formatActivity } from '../../src/utils/activity';
import { getEndedOwnershipNotice } from '../../src/utils/contract';
import {
  buildRenewalMessage,
  getDaysUntilExpiry,
  getVerificationAction,
  isAttemptActive,
  isSoldReason,
  losesCommunityAccess,
  toOwnershipEndBody,
  toRenewalNotices,
} from '../../src/utils/ownershipVerification';

const NOW = new Date('2026-11-03T03:00:00Z');
const DONG = '1171010100';

const ownershipOf = (overrides = {}) => ({
  id: 'mine',
  isActive: true,
  verificationStatus: 'VERIFIED',
  verificationExpiresAt: '2026-11-20T00:00:00.000Z',
  property: { id: 'p1', displayName: '항여울 116동 712호', complex: { legalDongCode: DONG } },
  ...overrides,
});

describe('isAttemptActive', () => {
  it('PENDING·RUNNING만 진행 중이다', () => {
    expect(isAttemptActive({ status: 'PENDING' })).toBe(true);
    expect(isAttemptActive({ status: 'RUNNING' })).toBe(true);
    expect(isAttemptActive({ status: 'FAILED' })).toBe(false);
    expect(isAttemptActive(null)).toBe(false);
  });
});

describe('getDaysUntilExpiry', () => {
  it('KST 달력으로 센다', () => {
    expect(getDaysUntilExpiry('2026-11-20T00:00:00.000Z', NOW)).toBe(17);
    expect(getDaysUntilExpiry('2026-11-02T00:00:00.000Z', NOW)).toBe(-1);
    expect(getDaysUntilExpiry(null, NOW)).toBeNull();
  });
});

describe('getVerificationAction', () => {
  it('상태별 다음 행동', () => {
    expect(getVerificationAction(ownershipOf({ verificationStatus: 'UNVERIFIED' }), NOW)).toBe('VERIFY');
    expect(getVerificationAction(ownershipOf({ verificationStatus: 'REVOKED' }), NOW)).toBe('INQUIRY');
    expect(getVerificationAction(ownershipOf({ verificationStatus: 'EXPIRED' }), NOW)).toBe('RENEW');
  });
  it('유효한 인증은 만료 30일 전부터 재인증한다', () => {
    expect(getVerificationAction(ownershipOf({ verificationExpiresAt: '2026-12-03T00:00:00.000Z' }), NOW)).toBe('RENEW');
    expect(getVerificationAction(ownershipOf({ verificationExpiresAt: '2026-12-05T00:00:00.000Z' }), NOW)).toBeNull();
  });
  it('끝난 소유 관계는 할 일이 없다', () => {
    expect(getVerificationAction(ownershipOf({ isActive: false, verificationStatus: 'UNVERIFIED' }), NOW)).toBeNull();
  });
});

describe('losesCommunityAccess', () => {
  const other = (overrides) => ownershipOf({ id: 'other', verificationExpiresAt: '2028-01-01T00:00:00.000Z', ...overrides });

  it('만료 전 대상 자신의 법정동 코드만 있으면 권한을 잃는다', () => {
    expect(losesCommunityAccess(ownershipOf(), { verifiedLegalDongCodes: [DONG], activeOwnerships: [ownershipOf()] })).toBe(true);
  });
  it('같은 법정동에 더 오래 유효한 호실이 있으면 잃지 않는다', () => {
    expect(losesCommunityAccess(ownershipOf(), { verifiedLegalDongCodes: [DONG], activeOwnerships: [ownershipOf(), other()] })).toBe(false);
  });
  it('대상보다 먼저 끝나는 호실은 세지 않는다', () => {
    const sooner = other({ verificationExpiresAt: '2026-11-10T00:00:00.000Z' });
    expect(losesCommunityAccess(ownershipOf(), { verifiedLegalDongCodes: [DONG], activeOwnerships: [sooner] })).toBe(true);
  });
  it('다른 법정동이나 만료된 호실은 세지 않는다', () => {
    const elsewhere = other({ property: { complex: { legalDongCode: '1171010200' } } });
    const expired = other({ verificationStatus: 'EXPIRED' });
    expect(losesCommunityAccess(ownershipOf(), { verifiedLegalDongCodes: [DONG], activeOwnerships: [elsewhere, expired] })).toBe(true);
  });
  it('만료된 대상은 코드에 자신이 없으므로 코드만으로 판단한다', () => {
    const expired = ownershipOf({ verificationStatus: 'EXPIRED' });
    expect(losesCommunityAccess(expired, { verifiedLegalDongCodes: [DONG] })).toBe(false);
    expect(losesCommunityAccess(expired, { verifiedLegalDongCodes: [] })).toBe(true);
  });
});

describe('재인증 안내 문구', () => {
  it('커뮤니티 권한을 잃을 때만 커뮤니티 문장이 있다', () => {
    expect(buildRenewalMessage(true)).toBe(
      '인증이 만료되면 호실 정보를 수정할 수 없고, 커뮤니티에 글을 쓸 수 없어요. 재인증하면 다시 쓸 수 있어요. 계약은 그대로 유지돼요.',
    );
    expect(buildRenewalMessage(false)).not.toContain('커뮤니티');
    expect(buildRenewalMessage(false)).toContain('계약은 그대로 유지돼요.');
  });
  it('대상별 안내를 만든다', () => {
    const [notice] = toRenewalNotices([ownershipOf()], { verifiedLegalDongCodes: [] }, NOW);
    expect(notice).toMatchObject({ id: 'mine', propertyId: 'p1', daysUntilExpiry: 17, isExpired: false, mentionsCommunity: true });
  });
});

describe('소유 종료 사유', () => {
  it('매도만 SOLD로 보낸다', () => {
    expect(toOwnershipEndBody('매도')).toEqual({ reason: '매도', endReason: 'SOLD' });
    expect(toOwnershipEndBody('증여')).toEqual({ reason: '증여' });
    expect(toOwnershipEndBody(null)).toEqual({});
    expect(isSoldReason('매도')).toBe(true);
    expect(isSoldReason('기타')).toBe(false);
  });
});

describe('끝난 소유 관계 문구', () => {
  it('소유권 이전과 그 외를 나눈다', () => {
    expect(getEndedOwnershipNotice('SOLD')).toBe('소유권 이전으로 종료된 소유 관계의 계약');
    expect(getEndedOwnershipNotice('SUPERSEDED')).toBe('소유권 이전으로 종료된 소유 관계의 계약');
    expect(getEndedOwnershipNotice('SELF_ENDED')).toBe('종료된 소유 관계의 계약');
    expect(getEndedOwnershipNotice('ADMIN_ENDED')).toBe('종료된 소유 관계의 계약');
    expect(getEndedOwnershipNotice(null)).toBeNull();
  });
});

describe('인증 활동 문장', () => {
  const params = { buildingNo: '116', unitNo: '712' };
  it('사유 없이 세 활동을 보여 준다', () => {
    expect(formatActivity({ type: 'OWNERSHIP_VERIFICATION_REQUESTED', params })).toBe('116동 712호 권리자 인증을 요청했어요');
    expect(formatActivity({ type: 'OWNERSHIP_VERIFIED', params })).toBe('116동 712호 권리자 인증을 마쳤어요');
    expect(formatActivity({ type: 'OWNERSHIP_VERIFICATION_FAILED', params })).toBe('116동 712호 권리자 인증을 마치지 못했어요');
  });
  it('자동 종료는 삭제했다고 쓰지 않는다', () => {
    expect(formatActivity({ type: 'OWNERSHIP_ENDED', params: { ...params, endReason: 'SUPERSEDED' } })).toBe('116동 712호 소유 관계가 종료됐어요');
    expect(formatActivity({ type: 'OWNERSHIP_ENDED', params })).toBe('116동 712호를 삭제했어요(소유 종료)');
  });
});

describe('라우트', () => {
  it('인증·문의 화면 경로', () => {
    expect(buildLocation('propertyVerify', { propertyId: 'p1' }).pathname).toBe('/properties/p1/verify');
    expect(resolveViewKey('/properties/p1/verify')).toBe('propertyVerify');
    expect(buildLocation('supportInquiry').pathname).toBe('/support/inquiry');
    expect(resolveViewKey('/support/inquiry')).toBe('supportInquiry');
  });
  it('등록 안내 문구는 주소에 남기지 않는다', () => {
    const location = buildLocation('propertyVerify', { propertyId: 'p1', notice: '안내' });
    expect(location.search).toBeUndefined();
    expect(location.state).toEqual({ notice: '안내' });
  });
});
