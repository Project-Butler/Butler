// 임대인 앱 M05~M08 화면 계산(순수 함수). 실패 조건: 공실에 보증금이 보임 · 세그먼트 수가 목록과 다름 · 검색이 띄어쓰기에 걸림
// · 갱신·초대 표기가 계약 응답과 다름 · 전세에 월세 행이 남음 · 월별 묶음 순서가 뒤집힘 · 준공연도 없을 때 빈 칸이 남음.
import { describe, expect, it } from 'vitest';
import { countSegments, filterAssets, SEGMENTS, toAssetCards } from '../../src/landlord/app/utils/assets';
import { getContractTitle, getInvitationLabel, getRenewalRemaining, toContractRows } from '../../src/landlord/app/utils/contractView';
import { formatLogDay, getLogSourceLabel, groupLogsByMonth } from '../../src/landlord/app/utils/logGroups';
import { formatPropertySpec, getMoreMenuTargets, toSummaryStats } from '../../src/landlord/app/utils/propertyView';

const property = (overrides) => ({
  id: 'p1',
  displayName: '래미안 101동 101호',
  complex: { id: 'cx1', name: '래미안', roadAddress: '서울시 강남구 테헤란로 12' },
  buildingNo: '101',
  unitNo: '101',
  exclusiveArea: 84.92,
  status: 'LEASED',
  myRelation: { type: 'OWNER', ownershipId: 'o1', verificationStatus: 'VERIFIED' },
  myListing: { unitType: 'THREE_ROOM' },
  ...overrides,
});

const contract = (overrides) => ({
  id: 'c1',
  property: { id: 'p1', buildingNo: '101', unitNo: '101' },
  tenantName: '김임차',
  tenant: { name: '김임차', userId: 'u-t' },
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 500000,
  rentPaymentDay: 25,
  startDate: '2024-10-28',
  endDate: '2026-10-27',
  status: 'EXPIRING_SOON',
  daysUntilEnd: 7,
  previousContractId: null,
  endReason: null,
  ...overrides,
});

describe('내 자산 카드 (M05)', () => {
  it('계약 중 호실은 종료일이 가장 가까운 계약의 임차인·보증금을 붙인다', () => {
    const [card] = toAssetCards([property()], [contract({ id: 'c1' }), contract({ id: 'c2', tenantName: '나중', deposit: 1 })]);
    expect(card.tenantLine).toBe('임차인 김임차 · 계약 중');
    expect(card.depositLabel).toBe('보증금 5,000만');
    expect(card.spec).toBe('쓰리룸 · 전용 84.92m²');
    expect(card.verification).toEqual({ tone: 'verified', label: '인증 완료' });
    expect(card.verifyLabel).toBeNull();
  });

  it('공실이면 보증금을 보여 주지 않는다(계약이 붙어 있어도)', () => {
    const [card] = toAssetCards([property({ status: 'VACANT' })], [contract()]);
    expect(card.tenantLine).toBe('공실 · 임차인 없음');
    expect(card.depositLabel).toBeNull();
  });

  it('미인증이면 [인증하기], 만료면 [재인증하기], 인증 취소면 버튼 없음', () => {
    const cards = toAssetCards(
      [
        property({ id: 'a', myRelation: { verificationStatus: 'UNVERIFIED' } }),
        property({ id: 'b', myRelation: { verificationStatus: 'EXPIRED' } }),
        property({ id: 'c', myRelation: { verificationStatus: 'REVOKED' } }),
      ],
      [],
    );
    expect(cards.map((card) => card.verifyLabel)).toEqual(['인증하기', '재인증하기', null]);
    expect(cards[0].verification.label).toBe('미인증');
  });

  it('유형·면적이 없으면 그 칸을 뺀다', () => {
    const [card] = toAssetCards([property({ myListing: null, exclusiveArea: null })], []);
    expect(card.spec).toBe('');
  });

  it('세그먼트 수와 거르기: 계약 대기도 계약 중으로 센다', () => {
    const cards = toAssetCards(
      [property({ id: 'a' }), property({ id: 'b', status: 'CONTRACT_PENDING' }), property({ id: 'c', status: 'VACANT' })],
      [],
    );
    expect(countSegments(cards)).toEqual({ all: 3, leased: 2, vacant: 1 });
    expect(filterAssets(cards, { segment: SEGMENTS.VACANT }).map((card) => card.id)).toEqual(['c']);
    expect(filterAssets(cards, { segment: SEGMENTS.LEASED }).map((card) => card.id)).toEqual(['a', 'b']);
  });

  it('검색은 호실 이름·단지명·주소에서 띄어쓰기 없이 찾는다', () => {
    const cards = toAssetCards([property({ id: 'a' }), property({ id: 'b', displayName: '자이 1호', complex: { name: '자이', roadAddress: '부산시' } })], []);
    expect(filterAssets(cards, { query: '101 동' }).map((card) => card.id)).toEqual(['a']);
    expect(filterAssets(cards, { query: '테헤란' }).map((card) => card.id)).toEqual(['a']);
    expect(filterAssets(cards, { query: '자이' }).map((card) => card.id)).toEqual(['b']);
    expect(filterAssets(cards, { query: '없는곳' })).toEqual([]);
  });
});

describe('부동산 상세 (M06)', () => {
  it('준공연도는 사용승인일 연도로, 없으면 통째로 뺀다', () => {
    expect(formatPropertySpec(property(), { buildingInfo: { approvalDate: '2009-03-02' } })).toBe('쓰리룸 · 전용 84.92m² · 2009년 준공');
    expect(formatPropertySpec(property(), { buildingInfo: null })).toBe('쓰리룸 · 전용 84.92m²');
    expect(formatPropertySpec(property(), undefined)).toBe('쓰리룸 · 전용 84.92m²');
  });

  it('요약 수치: 월세·전세·계약 없음', () => {
    expect(toSummaryStats(contract())).toEqual({ deposit: '5,000만', rent: '50만', dday: { tone: 'danger', label: 'D-7' } });
    expect(toSummaryStats(contract({ leaseType: 'JEONSE', monthlyRent: 0, daysUntilEnd: 100, status: 'ACTIVE' })).rent).toBe('전세');
    expect(toSummaryStats(null)).toEqual({ deposit: '—', rent: '—', dday: { label: '—', tone: 'default' } });
  });

  it('⋯ 메뉴는 이동형 동작만, 상태에 맞게', () => {
    const keys = (overrides) => getMoreMenuTargets(property(overrides)).map((item) => item.key);
    expect(keys({})).toEqual(['log']);
    expect(keys({ status: 'VACANT' })).toEqual(['contract', 'log']);
    expect(keys({ myRelation: { type: 'OWNER', verificationStatus: 'UNVERIFIED' } })).toEqual(['verify', 'log']);
    expect(keys({ myRelation: { type: 'FORMER_OWNER', verificationStatus: 'VERIFIED' } })).toEqual([]);
    expect(getMoreMenuTargets(property({ status: 'VACANT' }))[0].target).toEqual({ key: 'contractRegister', params: { propertyId: 'p1' } });
  });
});

describe('계약 관리 (M07)', () => {
  it('초대 상태는 임차인 계정 연결(tenant.userId) 여부', () => {
    expect(getInvitationLabel(contract())).toBe('초대 수락');
    expect(getInvitationLabel(contract({ tenant: { name: '김', userId: null } }))).toBe('초대 전');
  });

  it('갱신 남은 횟수: 이전 계약이 없으면 1회, 있으면 0회', () => {
    expect(getRenewalRemaining(contract())).toBe(1);
    expect(getRenewalRemaining(contract({ previousContractId: 'c0' }))).toBe(0);
  });

  it('제목과 행: 월세면 입금일까지, 전세면 월세 행이 없다', () => {
    expect(getContractTitle(contract())).toBe('계약 · 101동 101호');
    expect(toContractRows(contract())).toEqual([
      { label: '임차인', value: '김임차 · 초대 수락' },
      { label: '계약 기간', value: '2024-10-28 ~ 2026-10-27', numeric: true },
      { label: '보증금', value: '50,000,000원', numeric: true },
      { label: '월세', value: '500,000원 · 매월 25일', numeric: true },
      { label: '형태', value: '월세 · 갱신 1회 남음' },
    ]);
    const jeonse = toContractRows(contract({ leaseType: 'JEONSE', monthlyRent: 0, previousContractId: 'c0' }));
    expect(jeonse.map((row) => row.label)).toEqual(['임차인', '계약 기간', '보증금', '형태']);
    expect(jeonse.at(-1).value).toBe('전세 · 갱신 0회 남음');
  });
});

describe('관리 로그 (M08)', () => {
  it('달로 묶고 최신 달이 위, 달 안의 순서는 받은 그대로', () => {
    const groups = groupLogsByMonth([
      { id: 'a', occurredOn: '2026-10-20' },
      { id: 'b', occurredOn: '2026-09-30' },
      { id: 'c', occurredOn: '2026-10-02' },
      { id: 'd', occurredOn: '2025-12-01' },
    ]);
    expect(groups.map((group) => [group.label, group.items.map((log) => log.id)])).toEqual([
      ['2026년 10월', ['a', 'c']],
      ['2026년 9월', ['b']],
      ['2025년 12월', ['d']],
    ]);
  });

  it('날짜는 MM-DD, 연결 대상은 아는 것만 이름을 붙인다', () => {
    expect(formatLogDay('2026-10-20')).toBe('10-20');
    expect(getLogSourceLabel({ source: { resourceType: 'TICKET' } })).toBe('수리 요청');
    expect(getLogSourceLabel({ source: { resourceType: null } })).toBeNull();
    expect(getLogSourceLabel({ source: { resourceType: 'SOMETHING' } })).toBeNull();
  });
});
