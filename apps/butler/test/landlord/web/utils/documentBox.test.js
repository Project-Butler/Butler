// 문서함 표기·판단 도우미. 서버 값(apps/api documents/fileRules.js)과 어긋나지 않게 고정한다.
import { describe, expect, it } from 'vitest';
import {
  canDeleteDocument,
  describePropertyRow,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES_BY_TARGET,
  formatContractOption,
  formatContractPeriod,
  getContractGroupBadge,
  getRemainingSlots,
  getSelectableFileCount,
  getUploadTargets,
  hasUploadTarget,
  isSharedLockedDocument,
  splitPropertyName,
  pickDefaultContract,
  splitContracts,
  splitOwnerships,
  summarizeDocuments,
} from '../../../../src/landlord/web/utils/documentBox';

// 서버 DOCUMENT_TYPES(fileRules.js) 전체. 새 종류가 생기면 이 목록과 라벨을 함께 고친다.
const SERVER_DOCUMENT_TYPES = [
  'CONTRACT_DOCUMENT',
  'REGISTRY_CERTIFICATE',
  'PHOTO',
  'OTHER',
  'SALE_CONTRACT',
  'INSURANCE',
  'LEASE_REPORT',
  'RECEIPT',
  'MOVE_PHOTO',
];

const ME = 'user-1';
const ownershipDoc = (patch = {}) => ({ id: 'd1', resourceType: 'OWNERSHIP', uploaderId: ME, isLocked: false, ...patch });
const contractDoc = (patch = {}) => ({ id: 'd2', resourceType: 'CONTRACT', uploaderId: ME, isLocked: false, isSharedWithTenant: false, ...patch });
const contract = (patch = {}) => ({ id: 'c1', status: 'ACTIVE', isUploadable: true, ...patch });

describe('문서 종류 라벨', () => {
  it('서버 종류를 모두 덮는다', () => {
    expect(Object.keys(DOCUMENT_TYPE_LABELS).sort()).toEqual([...SERVER_DOCUMENT_TYPES].sort());
  });

  it('보관할 곳별 종류는 3-1 표와 같고 모두 라벨이 있다', () => {
    expect(DOCUMENT_TYPES_BY_TARGET.OWNERSHIP).toEqual(['REGISTRY_CERTIFICATE', 'SALE_CONTRACT', 'INSURANCE', 'OTHER']);
    expect(DOCUMENT_TYPES_BY_TARGET.CONTRACT).toEqual(['CONTRACT_DOCUMENT', 'LEASE_REPORT', 'RECEIPT', 'MOVE_PHOTO', 'OTHER']);
    for (const types of Object.values(DOCUMENT_TYPES_BY_TARGET)) {
      for (const type of types) expect(DOCUMENT_TYPE_LABELS[type], type).toBeTruthy();
    }
    expect(DOCUMENT_TYPES_BY_TARGET.CONTRACT.map((type) => DOCUMENT_TYPE_LABELS[type])).toEqual([
      '계약서·특약',
      '신고필증·확정일자',
      '영수증',
      '입주·퇴거 사진',
      '기타',
    ]);
  });
});

describe('남은 자리', () => {
  it('30 − 지금 수, 0 밑으로 내려가지 않는다', () => {
    expect(getRemainingSlots(0)).toBe(30);
    expect(getRemainingSlots(25)).toBe(5);
    expect(getRemainingSlots(30)).toBe(0);
    expect(getRemainingSlots(31)).toBe(0);
  });

  it('한 번에 고를 수 있는 파일 수는 남은 자리와 10개 중 작은 쪽에서 이미 고른 수를 뺀 값', () => {
    expect(getSelectableFileCount(0)).toBe(10);
    expect(getSelectableFileCount(0, 4)).toBe(6);
    expect(getSelectableFileCount(27)).toBe(3);
    expect(getSelectableFileCount(27, 2)).toBe(1);
    expect(getSelectableFileCount(30)).toBe(0);
    expect(getSelectableFileCount(0, 12)).toBe(0);
  });
});

describe('삭제 가능 판단', () => {
  it('내 소유 문서는 끝난 소유 관계여도 올린 본인이면 지운다(D-A)', () => {
    expect(canDeleteDocument(ownershipDoc(), { userId: ME })).toBe(true);
  });

  it('남이 올렸거나 잠긴 문서는 지울 수 없다', () => {
    expect(canDeleteDocument(ownershipDoc({ uploaderId: 'other' }), { userId: ME })).toBe(false);
    expect(canDeleteDocument(ownershipDoc({ isLocked: true }), { userId: ME })).toBe(false);
    expect(canDeleteDocument(contractDoc({ uploaderId: 'other' }), { userId: ME, contract: contract() })).toBe(false);
    expect(canDeleteDocument(contractDoc({ isLocked: true }), { userId: ME, contract: contract() })).toBe(false);
    expect(canDeleteDocument(ownershipDoc(), {})).toBe(false);
  });

  it('계약 문서는 그 계약의 소유 관계가 활성일 때만 지운다(isUploadable false면 못 지움)', () => {
    expect(canDeleteDocument(contractDoc(), { userId: ME, contract: contract() })).toBe(true);
    expect(canDeleteDocument(contractDoc(), { userId: ME, contract: contract({ isUploadable: false }) })).toBe(false);
    expect(canDeleteDocument(contractDoc(), { userId: ME })).toBe(false);
  });

  it('끝난 계약에서는 임차인에게 공유한 문서만 막는다(D-E)', () => {
    for (const status of ['EXPIRED', 'TERMINATED']) {
      expect(canDeleteDocument(contractDoc({ isSharedWithTenant: true }), { userId: ME, contract: contract({ status }) }), status).toBe(false);
      expect(canDeleteDocument(contractDoc({ isSharedWithTenant: false }), { userId: ME, contract: contract({ status }) }), status).toBe(true);
    }
  });

  it('진행 중 계약의 공유 문서는 지울 수 있다', () => {
    for (const status of ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON']) {
      expect(canDeleteDocument(contractDoc({ isSharedWithTenant: true }), { userId: ME, contract: contract({ status }) }), status).toBe(true);
    }
  });

  it('공유 잠금 안내는 끝난 계약의 내 공유 문서에만 뜬다', () => {
    const ended = contract({ status: 'EXPIRED' });
    expect(isSharedLockedDocument(contractDoc({ isSharedWithTenant: true }), { userId: ME, contract: ended })).toBe(true);
    expect(isSharedLockedDocument(contractDoc({ isSharedWithTenant: false }), { userId: ME, contract: ended })).toBe(false);
    expect(isSharedLockedDocument(contractDoc({ isSharedWithTenant: true }), { userId: ME, contract: contract() })).toBe(false);
    expect(isSharedLockedDocument(ownershipDoc(), { userId: ME })).toBe(false);
  });
});

describe('묶음 나누기', () => {
  it('계약: 소유가 활성인 진행 중 계약이 위, 나머지(만료·해지·소유 종료)는 지난 계약', () => {
    const contracts = [
      contract({ id: 'a', status: 'ACTIVE' }),
      contract({ id: 'b', status: 'EXPIRED' }),
      contract({ id: 'c', status: 'UPCOMING' }),
      contract({ id: 'd', status: 'ACTIVE', isUploadable: false }),
      contract({ id: 'e', status: 'TERMINATED' }),
    ];
    const { current, past } = splitContracts(contracts);
    expect(current.map((item) => item.id)).toEqual(['a', 'c']);
    expect(past.map((item) => item.id)).toEqual(['b', 'd', 'e']);
  });

  it('소유 관계: 첫 번째가 내 소유 문서, 나머지는 지난 소유 기간', () => {
    expect(splitOwnerships([{ id: 'x' }, { id: 'y' }, { id: 'z' }])).toEqual({ primary: { id: 'x' }, past: [{ id: 'y' }, { id: 'z' }] });
    expect(splitOwnerships([])).toEqual({ primary: null, past: [] });
  });

  it('계약 상태 칩: 소유가 끝난 계약은 날짜가 진행 중이어도 소유 종료', () => {
    expect(getContractGroupBadge(contract({ status: 'ACTIVE' }))).toEqual({ tone: 'success', label: '진행 중' });
    expect(getContractGroupBadge(contract({ status: 'ACTIVE', isUploadable: false }))).toEqual({ tone: 'default', label: '소유 종료' });
    expect(getContractGroupBadge(contract({ status: 'TERMINATED', isUploadable: false })).label).toBe('해지');
  });
});

describe('표기', () => {
  it('계약 기간·팝업 계약 칸 문구', () => {
    expect(formatContractPeriod('2025-03-02', '2027-02-28')).toBe('2025.03.02 ~ 2027.02.28');
    const base = { tenantName: '이세입', startDate: '2025-03-02', endDate: '2027-02-28' };
    expect(formatContractOption({ ...base, status: 'ACTIVE' })).toBe('이세입 · 2025.03.02 ~ 2027.02.28');
    expect(formatContractOption({ ...base, status: 'EXPIRED' })).toBe('이세입 · 2025.03.02 ~ 2027.02.28 (만료)');
    expect(formatContractOption({ ...base, status: 'TERMINATED' })).toBe('이세입 · 2025.03.02 ~ 2027.02.28 (해지)');
  });


  it('호실 줄 문구: 문서 수와 상태, 문서가 없으면 인증 여부에 따라 안내가 갈린다', () => {
    const verified = { documentCount: 0, status: 'VACANT', myRelation: { verificationStatus: 'VERIFIED' } };
    expect(describePropertyRow({ ...verified, documentCount: 3, status: 'LEASED' })).toEqual({ count: 3, text: '계약 중' });
    expect(describePropertyRow({ ...verified, documentCount: 3 })).toEqual({ count: 3, text: '공실' });
    expect(describePropertyRow(verified)).toEqual({ count: null, text: '문서 없음 · 계약서를 올려 두세요' });
    expect(describePropertyRow({ ...verified, myRelation: { verificationStatus: 'UNVERIFIED' } })).toEqual({
      count: null,
      text: '권리자 인증 후 문서를 올릴 수 있어요',
    });
    expect(describePropertyRow({ ...verified, myRelation: { verificationStatus: 'EXPIRED' } }).text).toBe('권리자 인증 후 문서를 올릴 수 있어요');
    expect(describePropertyRow({ ...verified, documentCount: 2 }, { isFormer: true })).toEqual({ count: 2, text: '소유 종료' });
  });
});

describe('올릴 곳', () => {
  const box = (ownership, contracts = []) => ({ ownerships: [ownership], contracts });

  it('인증된 활성 소유 관계는 내 소유 문서도 올릴 수 있다', () => {
    const targets = getUploadTargets(box({ isActive: true, isUploadable: true }));
    expect(targets.ownership).toBeTruthy();
    expect(targets.needsVerification).toBe(false);
  });

  it('미인증·만료 활성 소유 관계는 인증 안내가 뜨고, 계약이 없으면 올릴 곳이 없다', () => {
    const unverified = box({ isActive: true, isUploadable: false });
    expect(getUploadTargets(unverified)).toMatchObject({ ownership: null, needsVerification: true });
    expect(hasUploadTarget(unverified)).toBe(false);
  });

  it('인증이 만료돼도 활성 소유자의 계약 문서는 올릴 수 있다(D-F)', () => {
    const expired = box({ isActive: true, isUploadable: false }, [contract({ id: 'c1', status: 'EXPIRED' })]);
    expect(hasUploadTarget(expired)).toBe(true);
    expect(getUploadTargets(expired).contracts.map((item) => item.id)).toEqual(['c1']);
  });

  it('끝난 소유 관계는 올릴 곳도 인증 안내도 없다', () => {
    const ended = box({ isActive: false, isUploadable: false }, [contract({ isUploadable: false })]);
    expect(hasUploadTarget(ended)).toBe(false);
    expect(getUploadTargets(ended).needsVerification).toBe(false);
  });

  it('기본 계약은 진행 중 계약, 없으면 가장 최근 끝난 계약(올릴 수 있는 것만)', () => {
    expect(pickDefaultContract([contract({ id: 'old', status: 'EXPIRED' }), contract({ id: 'now' })]).id).toBe('now');
    expect(pickDefaultContract([contract({ id: 'recent', status: 'EXPIRED' }), contract({ id: 'older', status: 'TERMINATED' })]).id).toBe('recent');
    expect(pickDefaultContract([contract({ isUploadable: false })])).toBeNull();
  });
});

describe('호실 상세 카드 요약', () => {
  const doc = (id, createdAt) => ({ id, fileName: `${id}.pdf`, createdAt });

  it('개수·최근 2개·나머지 수를 준다(묶음이 여럿이어도 최근 순)', () => {
    const groups = [
      { documents: [doc('a', '2026-01-03T00:00:00Z'), doc('b', '2026-01-01T00:00:00Z')] },
      { documents: [doc('c', '2026-01-04T00:00:00Z'), doc('d', '2026-01-02T00:00:00Z')] },
    ];
    const summary = summarizeDocuments(groups);
    expect(summary.count).toBe(4);
    expect(summary.recent.map((item) => item.id)).toEqual(['c', 'a']);
    expect(summary.rest).toBe(2);
  });

  it('문서가 없으면 0', () => {
    expect(summarizeDocuments([{ documents: [] }])).toEqual({ count: 0, recent: [], rest: 0 });
    expect(summarizeDocuments([])).toEqual({ count: 0, recent: [], rest: 0 });
  });
});

describe('splitPropertyName (좁은 목록의 호실 이름)', () => {
  it('동·호와 단지명을 나눈다', () => {
    expect(splitPropertyName({ displayName: '잠실엘스 101동 1203호', buildingNo: '101', unitNo: '1203', complex: { name: '잠실엘스' } })).toEqual({
      unitLabel: '101동 1203호',
      complexName: '잠실엘스',
    });
  });
  it('동이 없는 건물은 호만', () => {
    expect(splitPropertyName({ buildingNo: '', unitNo: '410', complex: { name: '역삼오피스텔' } }).unitLabel).toBe('410호');
  });
  it('동·호가 없으면 displayName 그대로', () => {
    expect(splitPropertyName({ displayName: '잠실엘스 101동 1203호' })).toEqual({ unitLabel: '잠실엘스 101동 1203호', complexName: null });
  });
});
