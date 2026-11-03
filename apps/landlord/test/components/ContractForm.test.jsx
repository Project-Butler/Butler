import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ContractForm,
  EMPTY_CONTRACT_FORM,
  isContractFormComplete,
  toContractFields,
  toContractForm,
} from '../../src/components/ContractForm/ContractForm';

// 화면처럼 폼 상태를 들고 ContractForm에 넘긴다.
const Harness = ({ initial = EMPTY_CONTRACT_FORM, lockedFields = [] }) => {
  const [form, setForm] = useState(initial);
  return (
    <>
      <ContractForm
        form={form}
        onChange={(name, value) => setForm((prev) => ({ ...prev, [name]: value }))}
        fieldError={() => undefined}
        lockedFields={lockedFields}
      />
      <output data-testid="form">{JSON.stringify(form)}</output>
    </>
  );
};

const currentForm = () => JSON.parse(screen.getByTestId('form').textContent);

const FILLED = {
  ...EMPTY_CONTRACT_FORM,
  deposit: '10000000',
  monthlyRent: '500000',
  startDate: '2026-11-01',
  endDate: '2028-10-31',
  tenantName: '홍길동',
  tenantPhone: '01012345678',
};

const previousContract = {
  leaseType: 'MONTHLY',
  deposit: 10000000,
  monthlyRent: 500000,
  rentPaymentDay: 25,
  startDate: '2024-11-01',
  endDate: '2026-10-31',
  tenantName: '홍길동',
  tenant: { phone: '01012345678' },
  memo: null,
};

describe('계약 폼 월세 입금일(#76)', () => {
  it('월세면 1~30일과 말일을 고르고, 고른 값을 숫자로 보낸다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const select = screen.getByLabelText(/월세 입금일/);
    expect(select).toHaveAttribute('aria-required', 'true');
    // 안내 1개 + 1~30일 + 말일
    expect(select.querySelectorAll('option')).toHaveLength(32);
    expect(screen.getByRole('option', { name: '매월 말일' })).toHaveValue('31');

    await user.selectOptions(select, '25');
    expect(currentForm().rentPaymentDay).toBe('25');
    expect(toContractFields({ ...FILLED, rentPaymentDay: '31' }).rentPaymentDay).toBe(31);
  });

  it('월세는 입금일이 있어야 완성, 전세는 보지 않는다', () => {
    expect(isContractFormComplete(FILLED)).toBe(false);
    expect(isContractFormComplete({ ...FILLED, rentPaymentDay: '25' })).toBe(true);
    expect(isContractFormComplete({ ...FILLED, leaseType: 'JEONSE', monthlyRent: '' })).toBe(true);
  });

  it('전세로 바꾸면 칸을 숨기고 값을 비운다, 보낼 때도 null', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...FILLED, rentPaymentDay: '25' }} />);
    await user.click(screen.getByRole('button', { name: '전세' }));
    expect(screen.queryByLabelText(/월세 입금일/)).not.toBeInTheDocument();
    expect(currentForm().rentPaymentDay).toBe('');
    expect(toContractFields({ ...FILLED, leaseType: 'JEONSE', rentPaymentDay: '25' }).rentPaymentDay).toBeNull();
  });

  it('진행 중 계약 수정: 다른 조건은 잠겨도 입금일은 고칠 수 있다', () => {
    const locked = ['leaseType', 'deposit', 'monthlyRent', 'startDate', 'endDate', 'tenantName'];
    render(<Harness initial={{ ...FILLED, rentPaymentDay: '25' }} lockedFields={locked} />);
    expect(screen.getByLabelText(/월세 입금일/)).toBeEnabled();
    expect(screen.getByLabelText(/월세 입금일/)).toHaveValue('25');
  });

  it('기존 계약·갱신은 이전 계약의 입금일을 채운다, 값 없는 계약은 빈 칸', () => {
    expect(toContractForm(previousContract).rentPaymentDay).toBe('25');
    expect(toContractForm({ ...previousContract, rentPaymentDay: null }).rentPaymentDay).toBe('');
    render(<Harness initial={toContractForm({ ...previousContract, rentPaymentDay: 31 })} />);
    expect(screen.getByLabelText(/월세 입금일/)).toHaveValue('31');
  });
});
