import { describe, expect, it } from 'vitest';
import { buildLocation } from '../../src/landlord/web/routes';
import {
  checkContractFile,
  formatDotDate,
  formatMonthDay,
  getInvitationChip,
  hasVerifyFailureAlert,
  isAccountNameDifferent,
  maskPhone,
  MAX_SHARED_DOCUMENTS,
  selectUploadedDocument,
  toggleSharedDocument,
  toPreviewDocuments,
} from '../../src/landlord/web/utils/tenantInvite';

const ids = (count) => Array.from({ length: count }, (_, index) => `doc-${index + 1}`);

describe('maskPhone', () => {
  it('가운데 자리를 가리고 뒤 4자리만 남긴다', () => {
    expect(maskPhone('01012344444')).toBe('010-****-4444');
    expect(maskPhone('010-1234-4444')).toBe('010-****-4444');
    expect(maskPhone('0101234567')).toBe('010-***-4567');
  });
  it('값이 없거나 짧으면 숫자를 보이지 않는다', () => {
    expect(maskPhone(null)).toBe('');
    expect(maskPhone('0101')).toBe('010-****-****');
  });
});

describe('공유 계약서 선택 한도(A2c)', () => {
  it('한도는 서버와 같은 10개', () => {
    expect(MAX_SHARED_DOCUMENTS).toBe(10);
  });
  it('켜고 끈다', () => {
    expect(toggleSharedDocument([], 'a')).toEqual({ selectedIds: ['a'], exceeded: false });
    expect(toggleSharedDocument(['a', 'b'], 'a')).toEqual({ selectedIds: ['b'], exceeded: false });
  });
  it('11번째는 선택되지 않고 exceeded', () => {
    const ten = ids(10);
    expect(toggleSharedDocument(ten, 'doc-11')).toEqual({ selectedIds: ten, exceeded: true });
  });
  it('가득 차도 고른 것을 끄는 건 된다', () => {
    expect(toggleSharedDocument(ids(10), 'doc-3').selectedIds).toHaveLength(9);
  });
  it('새로 올린 파일은 자리가 있으면 바로 선택, 없으면 exceeded', () => {
    expect(selectUploadedDocument(ids(9), 'new')).toEqual({ selectedIds: [...ids(9), 'new'], exceeded: false });
    expect(selectUploadedDocument(ids(10), 'new')).toEqual({ selectedIds: ids(10), exceeded: true });
    expect(selectUploadedDocument(['new'], 'new')).toEqual({ selectedIds: ['new'], exceeded: false });
  });
});

describe('getInvitationChip (A4)', () => {
  const latest = { expiresAt: '2026-11-18T05:00:00.000Z' };
  it('대기는 만료일(KST MM.DD)과 링크 다시 만들기', () => {
    expect(getInvitationChip('PENDING', latest)).toEqual({ kind: 'PENDING', tone: 'warning', label: '초대 대기 · 11.18 만료', action: 'reissue' });
    expect(getInvitationChip('PENDING', undefined).label).toBe('초대 대기');
  });
  it('만료는 새 링크 만들기', () => {
    expect(getInvitationChip('EXPIRED')).toMatchObject({ label: '링크 만료', action: 'renew' });
  });
  it('수락은 앱 연결됨(버튼 없음)', () => {
    expect(getInvitationChip('ACCEPTED')).toMatchObject({ kind: 'ACCEPTED', label: '앱 연결됨', action: null });
  });
  it('초대 전·취소는 임차인 초대 버튼만', () => {
    expect(getInvitationChip(null)).toMatchObject({ kind: 'NONE', label: null, action: 'invite' });
    expect(getInvitationChip('CANCELED')).toMatchObject({ kind: 'NONE', action: 'invite' });
  });
});

describe('초대 보조 값', () => {
  it('KST 날짜 표기', () => {
    expect(formatDotDate('2026-11-17T16:00:00.000Z')).toBe('2026.11.18');
    expect(formatMonthDay('2026-11-17T16:00:00.000Z')).toBe('11.18');
    expect(formatDotDate(null)).toBeNull();
  });
  it('앱 계정 이름이 계약 이름과 다른지(공백 무시)', () => {
    expect(isAccountNameDifferent('이세빈', '이세입')).toBe(true);
    expect(isAccountNameDifferent('이 세입', '이세입')).toBe(false);
    expect(isAccountNameDifferent(null, '이세입')).toBe(false);
  });
  it('본인 확인 실패 안내는 대기 중이고 landlordAlertedAt이 있을 때만', () => {
    expect(hasVerifyFailureAlert('PENDING', { landlordAlertedAt: '2026-11-12T00:00:00.000Z' })).toBe(true);
    expect(hasVerifyFailureAlert('PENDING', {})).toBe(false);
    expect(hasVerifyFailureAlert('EXPIRED', { landlordAlertedAt: '2026-11-12T00:00:00.000Z' })).toBe(false);
  });
  it('계약서 형식은 PDF·JPG·PNG만', () => {
    expect(checkContractFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull();
    expect(checkContractFile({ name: 'a.jpg', type: '', size: 10 })).toBeNull();
    expect(checkContractFile({ name: 'a.heic', type: 'image/heic', size: 10 })).toMatch('PDF 또는 사진');
    expect(checkContractFile({ name: 'a.png', type: 'image/png', size: 0 })).toMatch('빈 파일');
  });
  it('미리보기는 고른 파일만, 없으면 전부', () => {
    const documents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(toPreviewDocuments(documents, ['c', 'a']).map((document) => document.id)).toEqual(['a', 'c']);
    expect(toPreviewDocuments(documents, [])).toBe(documents);
  });
});

describe('호실 상세 주소의 초대 팝업 state', () => {
  it('inviteContractId는 주소가 아니라 history state로만', () => {
    expect(buildLocation('propertyDetail', { propertyId: 'p1', inviteContractId: 'c1' })).toEqual({
      pathname: '/landlord/properties/p1',
      search: '',
      state: { inviteContractId: 'c1' },
    });
    expect(buildLocation('propertyDetail', { propertyId: 'p1' }).state).toBeUndefined();
  });
});
