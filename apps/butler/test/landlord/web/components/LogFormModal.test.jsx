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

const VERIFIED_PROPERTY = { ...PROPERTY, myRelation: { verificationStatus: 'VERIFIED' } };
const HISTORY_NOTICE = '집 이력으로 남아요 — 이 집을 넘기면 다음 임대인도 봐요';
const UNVERIFIED_WARNING = '권리자 인증 전에 남긴 기록은 호실이 목록에서 빠지면(삭제·자동 종료) 모두 사라져요';

describe('LogFormModal 공개 범위(H-29)', () => {
  const useProperty = (property) =>
    vi.mocked(getPropertyList).mockReset().mockResolvedValue({ data: [property], meta: { page: 1, size: 100, total: 1, hasNext: false } });
  const typeTitle = (title) => userEvent.type(screen.getByLabelText(/제목/), title);
  beforeEach(() => {
    vi.mocked(postManagementLog).mockReset().mockResolvedValue(LOG);
    vi.mocked(patchManagementLog).mockReset();
    vi.mocked(getManagementLog).mockReset();
  });

  it('공개 범위 고르기가 없고, 인증 호실의 수리는 집 이력 안내만 보이며 scope를 보내지 않는다', async () => {
    useProperty(VERIFIED_PROPERTY);
    renderModal({ fixedPropertyId: 'p1' });
    await screen.findByText(HISTORY_NOTICE);
    expect(screen.queryByRole('button', { name: '호실 이력' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '나만 보기' })).not.toBeInTheDocument();
    expect(screen.queryByText(UNVERIFIED_WARNING)).not.toBeInTheDocument();

    await typeTitle('욕실 수전 교체');
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));
    const body = vi.mocked(postManagementLog).mock.calls[0][1];
    expect(body.type).toBe('REPAIR');
    expect(body).not.toHaveProperty('scope');
    expect(body).not.toHaveProperty('keepPrivate');
  });

  it('메모는 [나만 보기] 체크(기본 해제), 체크하면 keepPrivate: true', async () => {
    useProperty(VERIFIED_PROPERTY);
    renderModal({ fixedPropertyId: 'p1' });
    await screen.findByText(HISTORY_NOTICE);
    await userEvent.click(screen.getByRole('button', { name: '메모' }));
    const checkbox = screen.getByRole('checkbox', { name: '나만 보기' });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await typeTitle('관리실 연락처');
    await userEvent.click(screen.getByRole('button', { name: '기록 저장' }));
    expect(postManagementLog).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'NOTE', keepPrivate: true }));
  });

  it('인증 전 호실은 나만 보기로 저장된다는 안내와 사라짐 경고(H-37)', async () => {
    useProperty(PROPERTY);
    renderModal({ fixedPropertyId: 'p1' });
    expect(await screen.findByText(UNVERIFIED_WARNING)).toBeInTheDocument();
    expect(screen.getByText('권리자 인증 전이라 나만 보기로 저장돼요')).toBeInTheDocument();
    expect(screen.queryByText(HISTORY_NOTICE)).not.toBeInTheDocument();
  });

  it('수정: 수리 요청 완료 기록은 유형을 바꿀 수 없고 type을 보내지 않는다(H-47)', async () => {
    useProperty(VERIFIED_PROPERTY);
    vi.mocked(getManagementLog).mockResolvedValue({ ...LOG, type: 'TICKET_SUMMARY', scope: 'PROPERTY_HISTORY', author: null });
    vi.mocked(patchManagementLog).mockResolvedValue(LOG);
    renderModal({ logId: 'log-1' });
    expect(await screen.findByText('수리 요청 완료')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수리' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(vi.mocked(patchManagementLog).mock.calls[0][1]).not.toHaveProperty('type');
  });
});
