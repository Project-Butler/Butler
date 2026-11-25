// 매도 호실 안내 띠 + 목록에서 지우기(#203 P-4b, H-41).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({ postOwnershipRemove: vi.fn() }));

import { postOwnershipRemove } from '@butler/api-client';
import { SoldHomeBanner } from '../../../../src/landlord/web/components/SoldHomeBanner/SoldHomeBanner';

const renderBanner = () => {
  const onRemoved = vi.fn();
  render(<SoldHomeBanner ownershipId="o1" endedOn="2026-10-31" isSold onRemoved={onRemoved} />);
  return onRemoved;
};

describe('매도 호실 안내 띠', () => {
  beforeEach(() => {
    vi.mocked(postOwnershipRemove).mockReset();
  });

  it('매도 날짜와 넘어간 이력 안내, [목록에서 지우기]', () => {
    renderBanner();
    const banner = screen.getByRole('region', { name: '소유가 끝난 호실' });
    expect(banner).toHaveTextContent('2026-10-31에 매도한 호실이에요');
    expect(banner).toHaveTextContent('내 화면에서 삭제');
  });

  it('확인 팝업에서 되돌릴 수 없음을 알리고, 지우면 onRemoved', async () => {
    vi.mocked(postOwnershipRemove).mockResolvedValue(undefined);
    const onRemoved = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /목록에서 지우기/ }));
    const dialog = screen.getByRole('dialog', { name: '이 호실을 목록에서 지울까요?' });
    expect(dialog).toHaveTextContent('되돌릴 수 없어요');
    expect(postOwnershipRemove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '목록에서 지우기' }));
    expect(postOwnershipRemove).toHaveBeenCalledWith('o1');
    expect(onRemoved).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('취소하면 지우지 않는다', async () => {
    const onRemoved = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /목록에서 지우기/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(postOwnershipRemove).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('실패하면 팝업에 오류를 보여 주고 머문다', async () => {
    vi.mocked(postOwnershipRemove).mockRejectedValue({ response: { status: 422, data: { error: { code: 'OWNERSHIP_ACTIVE', message: '활성 소유 관계는 지울 수 없습니다.' } } } });
    const onRemoved = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /목록에서 지우기/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '목록에서 지우기' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
