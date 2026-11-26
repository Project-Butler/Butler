// 공용 대화 부품(말풍선·메시지 목록·대화 목록 한 줄) — 역할 폴더를 모르고 myUserId 로만 나/상대를 가른다.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageList } from '../../../src/shared/threads/MessageList';
import { ThreadList } from '../../../src/shared/threads/ThreadList';

const api = vi.hoisted(() => ({ postDocumentDownloadUrl: vi.fn() }));
vi.mock('@butler/api-client', () => api);

afterEach(() => vi.clearAllMocks());

const ME = 'landlord-1';
const msg = (id, overrides = {}) => ({
  id,
  body: `본문 ${id}`,
  sender: { id: 'tenant-1' },
  attachments: [],
  isHidden: false,
  sentAt: '2026-11-26T05:20:00.000Z',
  ...overrides,
});

describe('MessageList · MessageBubble', () => {
  it('날짜 줄로 묶고, 내 메시지는 오른쪽(연한 초록)·상대는 왼쪽(흰 바탕), 시각은 24시간', () => {
    render(
      <MessageList
        myUserId={ME}
        messages={[msg('m1', { sentAt: '2026-11-25T09:02:00.000Z' }), msg('m2', { sender: { id: ME }, body: '확인했어요' })]}
      />,
    );
    expect(screen.getByRole('region', { name: '2026-11-25 (수)' })).toBeInTheDocument();
    const today = screen.getByRole('region', { name: '2026-11-26 (목)' });
    const mine = within(today).getByText('확인했어요').closest('li');
    expect(mine.className).toMatch(/items-end/);
    expect(within(mine).getByText('확인했어요').parentElement.className).toMatch(/bg-accent-soft/);
    expect(within(today).getByText('14:20')).toBeInTheDocument();
    const theirs = screen.getByText('본문 m1').closest('li');
    expect(theirs.className).toMatch(/items-start/);
  });

  it('운영자가 숨긴 메시지는 내용 대신 안내만, 첨부는 썸네일로', () => {
    const pdf = { id: 'd1', fileName: '견적서.pdf', mimeType: 'application/pdf', sizeBytes: 10 };
    render(<MessageList myUserId={ME} messages={[msg('m1', { isHidden: true, body: null }), msg('m2', { body: '', attachments: [pdf] })]} />);
    expect(screen.getByText('운영자가 숨긴 메시지입니다')).toBeInTheDocument();
    expect(screen.getByTitle('견적서.pdf')).toBeInTheDocument();
  });

  it('메시지가 없으면 빈 대화 안내', () => {
    render(<MessageList myUserId={ME} messages={[]} />);
    expect(screen.getByText('아직 메시지가 없어요. 먼저 인사를 건네 보세요.')).toBeInTheDocument();
  });
});

const thread = (overrides = {}) => ({
  id: 't1',
  title: '101동 1001호 · 싱크대 누수',
  participants: [
    { id: ME, name: '김주인', role: 'LANDLORD' },
    { id: 'tenant-1', name: '이세입', role: 'TENANT' },
  ],
  lastMessage: msg('m1', { body: '네 괜찮아요!' }),
  unreadCount: 0,
  isReadOnly: false,
  createdAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});
const NOW = new Date('2026-11-26T06:00:00.000Z');

describe('ThreadList · ThreadListItem', () => {
  it('한 줄에 상대 이름 · 제목, 마지막 메시지, 시각, 안 읽은 수를 보이고 누르면 onOpen', async () => {
    const onOpen = vi.fn();
    render(<ThreadList threads={[thread({ unreadCount: 2 })]} myUserId={ME} onOpen={onOpen} now={NOW} />);
    // 버튼 이름 = 보이는 글 전체(미리보기·시각 포함) + 스크린리더용 안 읽은 수
    const row = screen.getByRole('button', { name: /^이세입 · 101동 1001호 · 싱크대 누수.*14:20.*네 괜찮아요!.*안 읽은 메시지 2개$/ });
    expect(within(row).getByText('네 괜찮아요!')).toBeInTheDocument();
    expect(within(row).getByText('14:20')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    await userEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('읽기 전용이면 "지난 대화" 칩, 안 읽은 게 없으면 숫자 없음', () => {
    render(<ThreadList threads={[thread({ id: 'old', isReadOnly: true, title: '1108동 502호 계약' })]} myUserId={ME} onOpen={() => {}} now={NOW} />);
    const row = screen.getByRole('button', { name: /^이세입 · 1108동 502호 계약.*지난 대화/ });
    expect(within(row).getByText('지난 대화')).toBeInTheDocument();
    expect(within(row).queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/안 읽은 메시지/)).not.toBeInTheDocument();
  });

  it('임차인이 보면 상대는 임대인(역할을 따지지 않고 나 아닌 참여자)', () => {
    render(<ThreadList threads={[thread()]} myUserId="tenant-1" onOpen={() => {}} now={NOW} />);
    expect(screen.getByRole('button', { name: /^김주인 · / })).toBeInTheDocument();
    expect(screen.getByText('나: 네 괜찮아요!')).toBeInTheDocument();
  });

  it('대화가 없으면 화면이 준 문구', () => {
    render(<ThreadList threads={[]} myUserId={ME} onOpen={() => {}} emptyText="아직 대화가 없어요. 호실 상세에서 시작할 수 있어요." />);
    expect(screen.getByText('아직 대화가 없어요. 호실 상세에서 시작할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '대화 목록' })).not.toBeInTheDocument();
  });
});
