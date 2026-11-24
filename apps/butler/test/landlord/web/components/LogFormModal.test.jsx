// 기록 추가·수정 팝업의 방 고르기(U-07).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({
  getPropertyList: vi.fn(),
  getManagementLog: vi.fn(),
  postManagementLog: vi.fn(),
  patchManagementLog: vi.fn(),
  getUploadRules: vi.fn(),
  postDocumentDownloadUrl: vi.fn(),
}));

import { getManagementLog, getPropertyList, patchManagementLog, postManagementLog } from '@butler/api-client';
import { LogFormModal } from '../../../../src/landlord/web/components/LogFormModal/LogFormModal';

const PROPERTY = { id: 'p1', displayName: '하늘숲아파트 101동 1203호', myRelation: { verificationStatus: 'UNVERIFIED' } };
const LOG = {
  id: 'log-1',
  propertyId: 'p1',
  property: PROPERTY,
  type: 'REPAIR',
  scope: 'PRIVATE',
  room: 'BATHROOM',
  title: '욕실 실리콘',
  content: null,
  occurredOn: '2026-11-13',
  cost: null,
  attachments: [],
  author: { id: 'me' },
  source: null,
  isReadOnly: false,
};

const renderModal = (props) => {
  const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
  render(<LogFormModal {...handlers} {...props} />);
  return handlers;
};

describe('LogFormModal 방 고르기', () => {
  beforeEach(() => {
    vi.mocked(getPropertyList).mockReset().mockResolvedValue({ data: [PROPERTY], meta: { page: 1, size: 100, total: 1, hasNext: false } });
    vi.mocked(postManagementLog).mockReset();
    vi.mocked(patchManagementLog).mockReset();
    vi.mocked(getManagementLog).mockReset();
  });

  it('추가: 선택 안 함 + 9가지, 고른 방을 보낸다', async () => {
    vi.mocked(postManagementLog).mockResolvedValue({ ...LOG, id: 'log-new', room: 'KITCHEN' });
    const { onSaved } = renderModal({ initialPropertyId: 'p1' });
    const group = screen.getByRole('radiogroup', { name: '방 (선택)' });
    expect(within(group).getAllByRole('radio')).toHaveLength(10);
    expect(within(group).getByRole('radio', { name: '선택 안 함' })).toHaveAttribute('aria-checked', 'true');

    await within(await screen.findByRole('combobox')).findByRole('option', { name: PROPERTY.displayName });
    await userEvent.type(screen.getByLabelText(/제목/), '주방 수전 교체');
    await userEvent.click(within(group).getByRole('radio', { name: '주방' }));
    expect(within(group).getByRole('radio', { name: '주방' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));

    expect(postManagementLog).toHaveBeenCalledWith('p1', expect.objectContaining({ room: 'KITCHEN', title: '주방 수전 교체' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('추가: 방을 고르지 않으면 null', async () => {
    vi.mocked(postManagementLog).mockResolvedValue({ ...LOG, room: null });
    renderModal({ fixedPropertyId: 'p1' });
    await waitFor(() => expect(screen.getByText(PROPERTY.displayName)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/제목/), '메모');
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));
    expect(postManagementLog).toHaveBeenCalledWith('p1', expect.objectContaining({ room: null }));
  });

  it('수정: 저장된 방이 골라져 있고, 선택 안 함으로 바꾸면 null을 보낸다', async () => {
    vi.mocked(getManagementLog).mockResolvedValue(LOG);
    vi.mocked(patchManagementLog).mockResolvedValue({ ...LOG, room: null });
    renderModal({ logId: 'log-1' });
    const group = await screen.findByRole('radiogroup', { name: '방 (선택)' });
    expect(within(group).getByRole('radio', { name: '욕실·화장실' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(within(group).getByRole('radio', { name: '선택 안 함' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(patchManagementLog).toHaveBeenCalledWith('log-1', expect.objectContaining({ room: null }));
  });
});
