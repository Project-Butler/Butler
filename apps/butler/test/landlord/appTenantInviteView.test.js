// 임대인 앱 임차인 초대 화면 값(#169).
// 실패 조건: 끝난·연결된 계약을 초대할 수 있다고 봄 · 계약 고르기에 중복·초대 불가 계약이 섞임 ·
// 공유 창을 닫았는데 복사로 넘어감 · 공유가 안 되는 브라우저에서 복사하지 않음.
import { describe, expect, it, vi } from 'vitest';
import {
  formatInviteContractLabel,
  getTenantInviteEntry,
  isInvitableContract,
  sendInviteLink,
  toInviteContractOptions,
} from '../../src/landlord/app/utils/tenantInviteView';

const contract = (overrides = {}) => ({
  id: 'c1',
  property: { displayName: '테스트아파트 101동 1203호' },
  tenantName: '이임차',
  startDate: '2026-11-01',
  isReadOnly: false,
  tenant: { name: '이임차', phone: '01098765432', userId: null, invitationStatus: null },
  ...overrides,
});

describe('isInvitableContract', () => {
  it('수정할 수 있고 임차인 계정이 없는 계약만 초대할 수 있다', () => {
    expect(isInvitableContract(contract())).toBe(true);
    expect(isInvitableContract(contract({ isReadOnly: true }))).toBe(false);
    expect(isInvitableContract(contract({ tenant: { userId: 'u-t', invitationStatus: 'ACCEPTED' } }))).toBe(false);
    expect(isInvitableContract(contract({ tenant: { userId: null, invitationStatus: 'ACCEPTED' } }))).toBe(false);
    expect(isInvitableContract(null)).toBe(false);
  });
});

describe('toInviteContractOptions', () => {
  it('들어온 계약을 맨 앞에, 나머지는 초대할 수 있는 것만 시작일 순으로 중복 없이', () => {
    const current = contract({ id: 'c1', startDate: '2026-11-01' });
    const listed = [
      contract({ id: 'c3', startDate: '2027-01-01' }),
      contract({ id: 'c1', startDate: '2026-11-01' }),
      contract({ id: 'c2', startDate: '2026-12-01' }),
      contract({ id: 'c4', isReadOnly: true }),
    ];
    expect(toInviteContractOptions(current, listed).map((item) => item.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('목록을 아직 못 불러왔으면 들어온 계약 하나', () => {
    expect(toInviteContractOptions(contract(), undefined).map((item) => item.id)).toEqual(['c1']);
  });
});

describe('formatInviteContractLabel', () => {
  it("'호실 · 시작일~'", () => {
    expect(formatInviteContractLabel(contract())).toBe('테스트아파트 101동 1203호 · 2026-11-01~');
  });
});

describe('getTenantInviteEntry', () => {
  it('초대 전이면 칩 없이 [임차인 초대]', () => {
    expect(getTenantInviteEntry(contract())).toEqual({ chip: null, actionLabel: '임차인 초대' });
  });

  it('대기 중이면 대기 칩과 [링크 다시 만들기], 만료면 [새 링크 만들기]', () => {
    const pending = getTenantInviteEntry(contract({ tenant: { userId: null, invitationStatus: 'PENDING' } }));
    expect(pending).toEqual({ chip: { tone: 'warning', label: '초대 대기' }, actionLabel: '링크 다시 만들기' });
    const expired = getTenantInviteEntry(contract({ tenant: { userId: null, invitationStatus: 'EXPIRED' } }));
    expect(expired.actionLabel).toBe('새 링크 만들기');
  });

  it('초대할 수 없는 계약이면 null', () => {
    expect(getTenantInviteEntry(contract({ isReadOnly: true }))).toBeNull();
  });
});

describe('sendInviteLink', () => {
  const link = { url: 'https://butler.test/invite/abc', tenantName: '이임차' };

  it('공유 창이 있으면 링크를 담아 연다', async () => {
    const nav = { share: vi.fn().mockResolvedValue(), clipboard: { writeText: vi.fn() } };
    expect(await sendInviteLink(link, nav)).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith(expect.objectContaining({ url: link.url, text: expect.stringContaining('이임차님') }));
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('공유 창을 닫으면 canceled, 복사하지 않는다', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    const nav = { share: vi.fn().mockRejectedValue(abort), clipboard: { writeText: vi.fn() } };
    expect(await sendInviteLink(link, nav)).toBe('canceled');
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('공유가 막히거나 없으면 복사, 복사도 안 되면 failed', async () => {
    const notAllowed = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const blocked = { share: vi.fn().mockRejectedValue(notAllowed), clipboard: { writeText: vi.fn().mockResolvedValue() } };
    expect(await sendInviteLink(link, blocked)).toBe('copied');
    expect(blocked.clipboard.writeText).toHaveBeenCalledWith(link.url);

    const noShare = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } };
    expect(await sendInviteLink(link, noShare)).toBe('failed');
  });
});
