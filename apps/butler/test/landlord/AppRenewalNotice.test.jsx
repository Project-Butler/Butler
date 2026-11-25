// 임대인 앱 계약 관리의 갱신 거절 통지 카드·기록 시트(#163).
// 실패 조건: 통지 기간·권장 마감이 API 와 다름 · 도달 기준·2년 갱신·법률 자문 아님 안내가 빠짐 ·
// 기록 저장 body 가 계약과 다름 · 끝난 계약에 기록 폼이 열림 · 저장·삭제 뒤 계약을 다시 안 불러옴.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getContract: vi.fn(),
  getRenewalNoticeList: vi.fn(),
  postRenewalNotice: vi.fn(),
  deleteRenewalNotice: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const USER = { id: 'l-1', name: '김집주', role: 'LANDLORD' };
const SUMMARY = {
  windowStart: '2026-11-30',
  deadline: '2027-03-31',
  safeDeadline: '2027-03-30',
  phase: 'BEFORE_WINDOW',
  daysUntilDeadline: 132,
  hasDeliveredInTime: false,
  latestNotice: null,
};
const CONTRACT = {
  id: 'c1',
  property: { id: 'p1', displayName: '래미안 101동 101호', buildingNo: '101', unitNo: '101' },
  tenantName: '김임차',
  tenant: { name: '김임차', userId: 'u-t', phone: null },
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 500000,
  rentPaymentDay: 25,
  startDate: '2025-06-01',
  endDate: '2027-05-31',
  status: 'ACTIVE',
  daysUntilEnd: 558,
  previousContractId: null,
  endReason: null,
  isReadOnly: false,
  renewalNotice: SUMMARY,
};
const NOTICE = {
  id: 'rn1',
  contractId: 'c1',
  kind: 'REFUSE_RENEWAL',
  method: 'CERTIFIED_MAIL',
  sentOn: '2026-12-01',
  deliveredOn: '2026-12-03',
  timing: 'IN_TIME',
  memo: '등기번호 1234',
  attachments: [{ id: 'd1' }],
  createdAt: '2026-12-03T00:00:00Z',
};

const renderAt = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T03:00:00Z'));
  api.getContract.mockResolvedValue(CONTRACT);
  api.getRenewalNoticeList.mockResolvedValue([]);
  api.postRenewalNotice.mockResolvedValue(NOTICE);
  api.deleteRenewalNotice.mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe('갱신 거절 통지 카드', () => {
  it('통지 기간 · 권장 마감과 D-day · 기간 전 안내 · 법 안내', async () => {
    renderAt('/landlord/contracts/c1');
    const card = within(await screen.findByRole('region', { name: '갱신 거절 통지' }));

    expect(card.getByText('통지 기간 전')).toBeInTheDocument();
    expect(card.getByText('2026-11-30 ~ 2027-03-31')).toBeInTheDocument();
    expect(card.getByText('2027-03-30까지 도달')).toBeInTheDocument();
    expect(card.getByText('D-132')).toBeInTheDocument();
    expect(card.getByText(/2026-11-30부터 통지할 수 있어요/)).toBeInTheDocument();
    expect(card.getByText(/도달한 날을 기준/)).toBeInTheDocument();
    expect(card.getByText(/같은 조건으로 2년 갱신/)).toBeInTheDocument();
    expect(card.getByText(/법률 자문이 아니에요/)).toBeInTheDocument();
  });

  it('기간 안에 도달한 기록이 있으면 "통지 완료"와 최근 기록, 경고 없음', async () => {
    api.getContract.mockResolvedValue({
      ...CONTRACT,
      renewalNotice: { ...SUMMARY, phase: 'OPEN', hasDeliveredInTime: true, latestNotice: NOTICE },
    });
    renderAt('/landlord/contracts/c1');
    const card = within(await screen.findByRole('region', { name: '갱신 거절 통지' }));

    expect(card.getByText('통지 완료')).toBeInTheDocument();
    expect(card.getByText('갱신 거절 · 내용증명')).toBeInTheDocument();
    expect(card.getByText('보냄 2026-12-01 · 도달 2026-12-03')).toBeInTheDocument();
    expect(card.getByText('기간 안 도달')).toBeInTheDocument();
    expect(card.queryByText(/까지 임차인에게 도달하게/)).toBeNull();
  });

  it('renewalNotice 가 없으면(소유자 아님·끝난 계약) 카드를 두지 않는다', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, renewalNotice: null });
    renderAt('/landlord/contracts/c1');
    await screen.findByRole('region', { name: '현재 계약' });
    expect(screen.queryByRole('region', { name: '갱신 거절 통지' })).toBeNull();
  });
});

describe('통지 기록 시트', () => {
  it('새 기록을 저장하면 API 계약 모양대로 body 를 보내고, 시트를 닫고 계약을 다시 불러온다', async () => {
    renderAt('/landlord/contracts/c1');
    await userEvent.click(await screen.findByRole('button', { name: '통지 기록' }));
    const sheet = within(screen.getByRole('dialog', { name: '통지 기록' }));
    expect(await sheet.findByText('아직 남긴 기록이 없어요.')).toBeInTheDocument();

    await userEvent.click(sheet.getByRole('button', { name: '조건 변경' }));
    await userEvent.click(sheet.getByRole('button', { name: '문자' }));
    const sentOn = sheet.getByLabelText('보낸 날');
    await userEvent.clear(sentOn);
    await userEvent.type(sentOn, '2026-11-18');
    await userEvent.type(sheet.getByLabelText('도달한 날 (선택)'), '2026-11-19');
    await userEvent.type(sheet.getByLabelText('메모 (선택)'), '  문자 캡처 보관  ');
    await userEvent.click(sheet.getByRole('button', { name: '기록 저장' }));

    expect(api.postRenewalNotice).toHaveBeenCalledWith('c1', {
      kind: 'CHANGE_TERMS',
      method: 'TEXT_MESSAGE',
      sentOn: '2026-11-18',
      deliveredOn: '2026-11-19',
      memo: '문자 캡처 보관',
      attachmentDocumentIds: [],
    });
    expect(screen.queryByRole('dialog', { name: '통지 기록' })).toBeNull();
    expect(api.getContract).toHaveBeenCalledTimes(2);
  });

  it('도달한 날이 보낸 날보다 앞서면 보내지 않고 알려 준다', async () => {
    renderAt('/landlord/contracts/c1');
    await userEvent.click(await screen.findByRole('button', { name: '통지 기록' }));
    const sheet = within(screen.getByRole('dialog', { name: '통지 기록' }));
    await userEvent.type(sheet.getByLabelText('도달한 날 (선택)'), '2026-11-01');
    await userEvent.click(sheet.getByRole('button', { name: '기록 저장' }));

    expect(sheet.getByText('보낸 날보다 앞설 수 없어요.')).toBeInTheDocument();
    expect(api.postRenewalNotice).not.toHaveBeenCalled();
  });

  it('서버 오류 문장을 그대로 보여 주고 시트는 열어 둔다', async () => {
    api.postRenewalNotice.mockRejectedValue({ response: { status: 422, data: { error: { code: 'CONTRACT_READ_ONLY', message: '끝난 계약은 바꿀 수 없어요.' } } } });
    renderAt('/landlord/contracts/c1');
    await userEvent.click(await screen.findByRole('button', { name: '통지 기록' }));
    const sheet = within(screen.getByRole('dialog', { name: '통지 기록' }));
    await userEvent.click(sheet.getByRole('button', { name: '기록 저장' }));

    expect(await sheet.findByText('끝난 계약은 바꿀 수 없어요.')).toBeInTheDocument();
  });

  it('저장된 기록은 한 번 더 확인하고 지운다', async () => {
    api.getRenewalNoticeList.mockResolvedValue([NOTICE]);
    renderAt('/landlord/contracts/c1');
    await userEvent.click(await screen.findByRole('button', { name: '통지 기록' }));
    const sheet = within(screen.getByRole('dialog', { name: '통지 기록' }));
    const saved = within(await sheet.findByRole('region', { name: '저장된 기록' }));
    expect(saved.getByText(/증빙 1개/)).toBeInTheDocument();
    expect(saved.getByText('등기번호 1234')).toBeInTheDocument();

    await userEvent.click(saved.getByRole('button', { name: '삭제' }));
    expect(api.deleteRenewalNotice).not.toHaveBeenCalled();
    await userEvent.click(within(saved.getByText('이 기록을 지울까요?').parentElement).getByRole('button', { name: '삭제' }));

    expect(api.deleteRenewalNotice).toHaveBeenCalledWith('c1', 'rn1');
    expect(api.getRenewalNoticeList).toHaveBeenCalledTimes(2);
    expect(api.getContract).toHaveBeenCalledTimes(2);
  });

  it('읽기 전용 계약은 기록만 보이고 폼·삭제가 없다', async () => {
    api.getContract.mockResolvedValue({ ...CONTRACT, isReadOnly: true });
    api.getRenewalNoticeList.mockResolvedValue([NOTICE]);
    renderAt('/landlord/contracts/c1');
    await userEvent.click(await screen.findByRole('button', { name: '통지 기록' }));
    const sheet = within(screen.getByRole('dialog', { name: '통지 기록' }));

    expect(await sheet.findByText('끝난 계약이라 기록을 더하거나 지울 수 없어요.')).toBeInTheDocument();
    expect(sheet.queryByRole('button', { name: '기록 저장' })).toBeNull();
    expect(sheet.getByRole('button', { name: '삭제' })).toBeDisabled();
  });
});
