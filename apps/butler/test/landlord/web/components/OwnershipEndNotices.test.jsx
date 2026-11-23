// 호실 삭제(종료) 패널 안내: 매도 때 처리 중 유지보수 요청 경고(H-32), 인증 전 기록 사라짐 안내.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({ getTicketList: vi.fn() }));

import { getTicketList } from '@butler/api-client';
import { OwnershipEndNotices } from '../../../../src/landlord/web/components/OwnershipEndNotices/OwnershipEndNotices';

const ticket = (id, status, title) => ({
  id,
  status,
  title,
  createdAt: '2026-11-10T03:00:00.000Z',
  room: 'BOILER_ROOM',
});

const renderNotices = (props = {}) =>
  render(<OwnershipEndNotices propertyId="p1" isSold isUnverified={false} {...props} />);

describe('OwnershipEndNotices', () => {
  beforeEach(() => {
    getTicketList.mockReset();
  });

  it('매도이고 처리 중인 요청이 있으면 경고와 목록을 보여준다', async () => {
    getTicketList.mockResolvedValue({
      data: [ticket('t1', 'OPEN', '보일러 고장'), ticket('t2', 'IN_PROGRESS', '누수 점검')],
      meta: { total: 2 },
    });
    renderNotices();
    const alert = await screen.findByRole('alert');
    expect(getTicketList).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'p1', status: 'OPEN,IN_PROGRESS' }));
    expect(within(alert).getByText(/처리 중인 유지보수 요청 2건은 새 임대인에게 넘어가지 않아요/)).toBeInTheDocument();
    expect(within(alert).getByText('확인 필요')).toBeInTheDocument();
    expect(within(alert).getByText('처리 중')).toBeInTheDocument();
    expect(within(alert).getAllByText(/보일러 고장 · 보일러실/).length).toBeGreaterThan(0);
    expect(within(alert).queryByRole('link')).toBeNull();
    expect(within(alert).getByText(/매도하면 이 요청은 멈추고 읽기 전용이 돼요/)).toBeInTheDocument();
  });

  it('처리 중인 요청이 0건이면 보이지 않는다', async () => {
    getTicketList.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderNotices();
    await vi.waitFor(() => expect(getTicketList).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('불러오기에 실패해도 아무것도 보이지 않는다', async () => {
    getTicketList.mockRejectedValue(new Error('boom'));
    renderNotices();
    await vi.waitFor(() => expect(getTicketList).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('매도가 아니면 요청을 불러오지도 않고 경고도 없다', () => {
    renderNotices({ isSold: false });
    expect(getTicketList).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('인증한 적 없으면 인증 전 기록 사라짐 안내를 보여준다', () => {
    renderNotices({ isSold: false, isUnverified: true });
    expect(screen.getByText('권리자 인증 전에 남긴 기록은 호실이 목록에서 빠지면(삭제·자동 종료) 모두 사라져요')).toBeInTheDocument();
  });

  it('인증한 적 있으면 그 안내는 없다', () => {
    renderNotices({ isSold: false, isUnverified: false });
    expect(screen.queryByText(/인증 전에 남긴 기록/)).toBeNull();
  });
});
