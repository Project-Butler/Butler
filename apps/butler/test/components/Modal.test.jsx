import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shield } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../../src/landlord/web/components/Modal/Modal';

const renderModal = (onClose = vi.fn()) => {
  render(
    <Modal title="권리자 인증" subtitle="도봉힐하우스 바동 102호" icon={Shield} onClose={onClose} footer={<button type="button">인증 시작</button>}>
      <p>본문</p>
    </Modal>,
  );
  return onClose;
};

describe('Modal (가운데 팝업)', () => {
  it('제목으로 이름 붙은 dialog를 열고 패널에 포커스를 옮긴다', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: '권리자 인증' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(screen.getByText('도봉힐하우스 바동 102호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증 시작' })).toBeInTheDocument();
  });

  it('Esc·닫기 버튼으로 onClose를 부른다', async () => {
    const onClose = renderModal();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('바깥(어두운 바탕)을 누르면 닫히고, 패널 안을 누르면 닫히지 않는다', async () => {
    const onClose = renderModal();
    await userEvent.click(screen.getByText('본문'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
