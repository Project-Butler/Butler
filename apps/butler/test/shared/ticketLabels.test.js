import { describe, expect, it } from 'vitest';
import {
  getTicketCategoryLabel,
  getTicketStatusLabel,
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORY_OPTIONS,
  TICKET_TABS,
} from '../../src/shared/ticketLabels';
import { getTicketStatusBadge } from '../../src/landlord/web/utils/ticketView';

describe('수리 요청 라벨(shared/ticketLabels)', () => {
  it('분류 라벨은 서버 TICKET_CATEGORY_LABELS와 같은 리터럴이다', () => {
    expect(TICKET_CATEGORY_LABELS).toEqual({ REPAIR: '수리', INSPECTION: '점검', OTHER: '기타' });
    expect(TICKET_CATEGORY_OPTIONS.map((option) => option.value)).toEqual(['REPAIR', 'INSPECTION', 'OTHER']);
    expect(getTicketCategoryLabel('INSPECTION')).toBe('점검');
    expect(getTicketCategoryLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it.each([
    ['OPEN', '확인 필요', '접수됨'],
    ['IN_PROGRESS', '처리 중', '처리 중'],
    ['DONE', '완료', '완료'],
    ['CANCELED', '취소', '취소'],
  ])('상태 %s: 임대인 "%s", 임차인 "%s"', (status, landlord, tenant) => {
    expect(getTicketStatusLabel(status, 'LANDLORD')).toBe(landlord);
    expect(getTicketStatusLabel(status, 'TENANT')).toBe(tenant);
  });

  it('모르는 상태는 그대로 돌려준다', () => {
    expect(getTicketStatusLabel('WHATEVER', 'TENANT')).toBe('WHATEVER');
  });

  it('목록 탭은 진행 중(접수·처리 중) / 완료(완료·취소)', () => {
    expect(TICKET_TABS.map((tab) => tab.status)).toEqual(['OPEN,IN_PROGRESS', 'DONE,CANCELED']);
  });

  it('임대인 ticketView 칩은 shared 라벨(임대인 문구)에 색만 더한다', () => {
    expect(getTicketStatusBadge('OPEN')).toEqual({ label: '확인 필요', tone: 'warning' });
    expect(getTicketStatusBadge('IN_PROGRESS')).toEqual({ label: '처리 중', tone: 'pending' });
  });
});
