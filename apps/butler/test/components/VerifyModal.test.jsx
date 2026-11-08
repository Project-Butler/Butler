import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@butler/api-client', () => ({ postOwnershipVerification: vi.fn() }));

import { postOwnershipVerification } from '@butler/api-client';
import { VerifyModal } from '../../src/landlord/web/components/VerifyModal/VerifyModal';

const unverified = { id: 'o1', isActive: true, verificationStatus: 'UNVERIFIED', verifiedAt: null, verificationExpiresAt: null };
const idleLatest = () => ({ data: null, isActive: false, isLoading: false, error: null, trackAttempt: vi.fn() });

const renderModal = (props = {}) => {
  const handlers = { onClose: vi.fn(), onInquiry: vi.fn(), onRegisterAnother: vi.fn(), onRevoked: vi.fn() };
  const latest = props.latest ?? idleLatest();
  render(<VerifyModal propertyName="테스트 단지 1동 101호" ownership={unverified} latest={latest} {...handlers} {...props} />);
  return { ...handlers, latest };
};

describe('VerifyModal (권리자 인증 팝업)', () => {
  beforeEach(() => vi.mocked(postOwnershipVerification).mockReset());

  it('동의해야 [인증 시작]이 켜지고, 시작하면 시도를 추적한다', async () => {
    vi.mocked(postOwnershipVerification).mockResolvedValue({ id: 'a1', status: 'PENDING' });
    const { latest } = renderModal();
    expect(screen.getByRole('dialog', { name: '권리자 인증' })).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: '인증 시작' });
    expect(startButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: '개인정보 수집·이용에 동의해요' }));
    await userEvent.click(startButton);

    expect(postOwnershipVerification).toHaveBeenCalledWith({ ownershipId: 'o1', consent: true });
    await waitFor(() => expect(latest.trackAttempt).toHaveBeenCalledWith({ id: 'a1', status: 'PENDING' }));
  });

  it('[나중에 하기]는 팝업을 닫는다', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('진행 중이면 동의 없이 안내와 [닫기]만 보인다', () => {
    renderModal({ latest: { ...idleLatest(), isActive: true } });
    expect(screen.getByRole('dialog', { name: '소유자 정보를 확인하고 있어요' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('인증을 마친 호실은 유효 기간과 [확인]을 보여 준다', async () => {
    const verified = { ...unverified, verificationStatus: 'VERIFIED', verifiedAt: '2026-11-01T00:00:00.000Z', verificationExpiresAt: '2099-11-01T00:00:00.000Z' };
    const { onClose } = renderModal({ ownership: verified });
    expect(screen.getByRole('dialog', { name: '권리자 인증을 마쳤어요' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('소유 중이 아닌 호실이면 안내만 보인다', () => {
    renderModal({ ownership: undefined, isNotOwner: true });
    expect(screen.getByText('지금 소유 중인 호실만 인증할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '인증 시작' })).not.toBeInTheDocument();
  });
});
