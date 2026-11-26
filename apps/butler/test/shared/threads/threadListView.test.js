// 대화 목록 표시 계산(shared/threads/threadView) — 2-2 규칙.
import { describe, expect, it } from 'vitest';
import {
  countUnreadThreads,
  formatThreadListTime,
  getLastMessagePreview,
  getThreadCounterpartName,
  sortThreadsForList,
} from '../../../src/shared/threads/threadView';

const ME = 'landlord-1';
const thread = (overrides = {}) => ({
  id: 't1',
  title: '101동 1001호 · 싱크대 누수',
  participants: [
    { id: ME, name: '김주인', role: 'LANDLORD' },
    { id: 'tenant-1', name: '이세입', role: 'TENANT' },
  ],
  lastMessage: null,
  unreadCount: 0,
  isReadOnly: false,
  createdAt: '2026-11-20T01:00:00.000Z',
  ...overrides,
});
const message = (overrides = {}) => ({ id: 'm1', body: '안녕하세요', sender: { id: 'tenant-1' }, attachments: [], isHidden: false, sentAt: '2026-11-26T05:20:00.000Z', ...overrides });

describe('getThreadCounterpartName', () => {
  it('나 아닌 참여자 이름 — 임대인·임차인 누가 불러도 상대가 나온다', () => {
    expect(getThreadCounterpartName(thread(), ME)).toBe('이세입');
    expect(getThreadCounterpartName(thread(), 'tenant-1')).toBe('김주인');
  });

  it('상대가 없으면 null', () => {
    expect(getThreadCounterpartName(thread({ participants: [{ id: ME, name: '김주인' }] }), ME)).toBeNull();
  });
});

describe('sortThreadsForList', () => {
  it('서버 순서(최근 메시지 순)는 지키고 읽기 전용만 맨 아래로 내린다', () => {
    const list = [thread({ id: 'a' }), thread({ id: 'old', isReadOnly: true }), thread({ id: 'b' }), thread({ id: 'old2', isReadOnly: true })];
    expect(sortThreadsForList(list).map((item) => item.id)).toEqual(['a', 'b', 'old', 'old2']);
  });

  it('받은 배열을 바꾸지 않는다', () => {
    const list = [thread({ id: 'old', isReadOnly: true }), thread({ id: 'a' })];
    sortThreadsForList(list);
    expect(list.map((item) => item.id)).toEqual(['old', 'a']);
  });
});

describe('countUnreadThreads', () => {
  it('안 읽은 메시지가 있는 대화 수(메시지 수의 합이 아니다)', () => {
    expect(countUnreadThreads([thread({ unreadCount: 3 }), thread({ unreadCount: 0 }), thread({ unreadCount: 1 })])).toBe(2);
    expect(countUnreadThreads([])).toBe(0);
  });
});

describe('formatThreadListTime (한국 시간)', () => {
  const now = new Date('2026-11-26T06:00:00.000Z'); // 15:00 KST
  it('오늘이면 시각(24시간)', () => {
    expect(formatThreadListTime('2026-11-26T05:20:00.000Z', now)).toBe('14:20');
  });
  it('올해 다른 날이면 "11월 20일"', () => {
    expect(formatThreadListTime('2026-11-20T01:00:00.000Z', now)).toBe('11월 20일');
  });
  it('KST 자정을 넘긴 UTC 전날 밤은 오늘로 본다', () => {
    expect(formatThreadListTime('2026-11-25T16:30:00.000Z', now)).toBe('01:30');
  });
  it('지난해면 "2025.11.20"', () => {
    expect(formatThreadListTime('2025-11-20T01:00:00.000Z', now)).toBe('2025.11.20');
  });
  it('값이 없으면 빈 글', () => {
    expect(formatThreadListTime(null, now)).toBe('');
  });
});

describe('getLastMessagePreview', () => {
  it('메시지가 없으면 안내', () => {
    expect(getLastMessagePreview(thread(), ME)).toBe('아직 메시지가 없어요');
  });
  it('상대 메시지는 그대로, 줄바꿈은 한 칸으로', () => {
    expect(getLastMessagePreview(thread({ lastMessage: message({ body: '내일\n3시 괜찮아요' }) }), ME)).toBe('내일 3시 괜찮아요');
  });
  it('내가 보냈으면 "나: "', () => {
    expect(getLastMessagePreview(thread({ lastMessage: message({ sender: { id: ME } }) }), ME)).toBe('나: 안녕하세요');
  });
  it('첨부만이면 사진/파일, 글과 같이면 " · 사진"', () => {
    const photo = { id: 'd1', mimeType: 'image/jpeg' };
    const pdf = { id: 'd2', mimeType: 'application/pdf' };
    expect(getLastMessagePreview(thread({ lastMessage: message({ body: '', attachments: [photo] }) }), ME)).toBe('사진');
    expect(getLastMessagePreview(thread({ lastMessage: message({ body: '', attachments: [photo, pdf] }) }), ME)).toBe('파일');
    expect(getLastMessagePreview(thread({ lastMessage: message({ body: '영수증이에요', attachments: [photo], sender: { id: ME } }) }), ME)).toBe(
      '나: 영수증이에요 · 사진',
    );
  });
  it('숨긴 메시지면 안내', () => {
    expect(getLastMessagePreview(thread({ lastMessage: message({ isHidden: true, body: null }) }), ME)).toBe('운영자가 숨긴 메시지입니다');
  });
});
