import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getManagementLog: vi.fn(),
  deleteManagementLog: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));

import { deleteManagementLog, getManagementLog } from '@butler/api-client';
import { LogInspector } from '../../src/landlord/web/components/LogInspector/LogInspector';

const log = {
  id: 'log-1',
  propertyId: 'p1',
  property: { displayName: '테스트 단지 1동 101호' },
  type: 'REPAIR',
  scope: 'PRIVATE',
  room: 'BATHROOM',
  title: '욕실 배수구 교체',
  content: '배수구 교체함',
  occurredOn: '2026-10-01',
  cost: 350000,
  attachments: [],
  author: { id: 'me' },
  source: null,
  isReadOnly: false,
  isDeletable: true,
};

const renderInspector = (logId) => {
  const handlers = { onClose: vi.fn(), onEdit: vi.fn(), onDeleted: vi.fn(), onNavigate: vi.fn() };
  render(<LogInspector logId={logId} {...handlers} />);
  return handlers;
};

describe('LogInspector (하우스 로그 오른쪽 기록 상세)', () => {
  beforeEach(() => {
    vi.mocked(getManagementLog).mockReset();
    vi.mocked(deleteManagementLog).mockReset();
  });

  it('고른 기록이 없으면 안내만 보이고 부르지 않는다', () => {
    renderInspector(undefined);
    expect(screen.getByText('기록을 고르세요')).toBeInTheDocument();
    expect(getManagementLog).not.toHaveBeenCalled();
  });

  it('기록 내용과 [호실 보기]·[수정]을 보여 준다', async () => {
    vi.mocked(getManagementLog).mockResolvedValue(log);
    const { onEdit, onNavigate } = renderInspector('log-1');
    expect(await screen.findByRole('heading', { name: '욕실 배수구 교체' })).toBeInTheDocument();
    expect(screen.getByText('350,000원')).toBeInTheDocument();
    expect(screen.getByText('욕실·화장실')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수리 요청 보기' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    expect(onEdit).toHaveBeenCalledWith('log-1');
    await userEvent.click(screen.getByRole('button', { name: '호실 보기' }));
    expect(onNavigate).toHaveBeenCalledWith('propertyDetail', { propertyId: 'p1' });
  });

  it('방이 없으면 —', async () => {
    vi.mocked(getManagementLog).mockResolvedValue({ ...log, room: null });
    renderInspector('log-1');
    await screen.findByRole('heading', { name: '욕실 배수구 교체' });
    expect(screen.getByText('방').nextElementSibling).toHaveTextContent('—');
  });

  it('읽기 전용 기록은 [수정]이 없다', async () => {
    vi.mocked(getManagementLog).mockResolvedValue({ ...log, isReadOnly: true, isDeletable: false, author: null });
    renderInspector('log-1');
    await screen.findByRole('heading', { name: '욕실 배수구 교체' });
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기록 삭제' })).not.toBeInTheDocument();
  });

  it('삭제는 한 번 더 묻고 지운다', async () => {
    vi.mocked(getManagementLog).mockResolvedValue(log);
    vi.mocked(deleteManagementLog).mockResolvedValue({ id: 'log-1' });
    const { onDeleted } = renderInspector('log-1');
    await userEvent.click(await screen.findByRole('button', { name: '기록 삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteManagementLog).toHaveBeenCalledWith('log-1');
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('삭제 버튼은 서버가 준 isDeletable을 따른다(호실 이력도 지울 수 있다, H-36)', async () => {
    vi.mocked(getManagementLog).mockResolvedValue({ ...log, scope: 'PROPERTY_HISTORY', isDeletable: true });
    renderInspector('log-1');
    expect(await screen.findByRole('button', { name: '기록 삭제' })).toBeInTheDocument();
  });

  it('매도 뒤 넘어간 기록(isHideOnly)은 [내 화면에서 삭제]이고 새 임대인에게는 그대로라고 묻는다(H-41)', async () => {
    vi.mocked(getManagementLog).mockResolvedValue({ ...log, scope: 'PROPERTY_HISTORY', isReadOnly: true, isDeletable: true, isHideOnly: true });
    vi.mocked(deleteManagementLog).mockResolvedValue({ id: 'log-1' });
    const { onDeleted } = renderInspector('log-1');
    await userEvent.click(await screen.findByRole('button', { name: '내 화면에서 삭제' }));
    expect(screen.getByText('내 화면에서만 지워요. 새 임대인에게는 그대로 보여요.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteManagementLog).toHaveBeenCalledWith('log-1');
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('isDeletable이 false면 나만 보기라도 삭제 버튼이 없다', async () => {
    vi.mocked(getManagementLog).mockResolvedValue({ ...log, isDeletable: false });
    renderInspector('log-1');
    await screen.findByRole('heading', { name: '욕실 배수구 교체' });
    expect(screen.queryByRole('button', { name: '기록 삭제' })).not.toBeInTheDocument();
  });

  it('나만 보기 기록은 자물쇠 "나만 보기" 칩, 호실 이력은 칩 없음', async () => {
    vi.mocked(getManagementLog).mockResolvedValue(log);
    renderInspector('log-1');
    expect(await screen.findByText('나만 보기')).toBeInTheDocument();
  });
});
