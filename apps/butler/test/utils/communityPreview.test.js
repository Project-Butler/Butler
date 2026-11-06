import { describe, expect, it } from 'vitest';
import { getRegionPreview } from '../../src/landlord/web/utils/communityPreview';

const b = (complexId, legalDongCode, verificationStatus, verifyPropertyId = null) => ({ complexId, legalDongCode, verificationStatus, verifyPropertyId });

describe('getRegionPreview', () => {
  it('같은 동에 인증된 건물이 하나라도 있으면 미리보기가 아니다', () => {
    const buildings = [b('a', '1171010100', 'UNVERIFIED', 'p-a'), b('c', '1171010100', 'VERIFIED')];
    expect(getRegionPreview(buildings, buildings[0])).toEqual({ reason: null, verifyPropertyId: null });
  });

  it('인증이 없으면 UNVERIFIED, 같은 동에 만료가 있으면 EXPIRED — 갈 호실은 지금 건물 것', () => {
    const pending = b('a', '1171010100', 'UNVERIFIED', 'p-a');
    expect(getRegionPreview([pending], pending)).toEqual({ reason: 'UNVERIFIED', verifyPropertyId: 'p-a' });
    const expired = b('e', '1171010100', 'EXPIRED', 'p-e');
    expect(getRegionPreview([pending, expired], pending)).toEqual({ reason: 'EXPIRED', verifyPropertyId: 'p-a' });
  });

  it('다른 동의 인증은 상관없다', () => {
    const pending = b('a', '1171010100', 'UNVERIFIED', 'p-a');
    expect(getRegionPreview([pending, b('z', '2635010500', 'VERIFIED')], pending).reason).toBe('UNVERIFIED');
  });

  it('건물이 없으면 미리보기 없음', () => {
    expect(getRegionPreview([], undefined)).toEqual({ reason: null, verifyPropertyId: null });
  });
});
