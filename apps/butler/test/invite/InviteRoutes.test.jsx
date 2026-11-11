// 공개 초대 화면(/invite/:token) 흐름: 로그인 상태별 분기(개발 계획 3-2), 본인 확인 오류, 수락, 가입 뒤 복귀.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  postLogout: vi.fn(),
  getTenantInvitationPreview: vi.fn(),
  postTenantInvitationVerify: vi.fn(),
  getTenantInvitationContract: vi.fn(),
  postTenantInvitationDocumentDownloadUrl: vi.fn(),
  postTenantInvitationAccept: vi.fn(),
  postRegister: vi.fn(),
  postLogin: vi.fn(),
  getOAuthSignup: vi.fn(),
  postOAuthSignup: vi.fn(),
  getOAuthStartUrl: vi.fn(() => '#'),
  postEmailVerification: vi.fn(),
  postEmailVerificationConfirm: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const { InviteRoutes } = await import('../../src/invite/InviteRoutes');
const { useSessionStore } = await import('../../src/store/sessionStore');

const PREVIEW = {
  status: 'PENDING',
  expiresAt: '2026-11-18T08:00:00Z',
  landlordName: '김임대',
  landlordVerified: true,
  propertyDisplayName: '잠실엘스 101동 1203호',
  leaseType: 'MONTHLY',
  startDate: '2026-12-01',
  endDate: '2028-11-30',
  sharedDocumentCount: 4,
};
const CONTRACT = {
  leaseType: 'MONTHLY',
  deposit: 50000000,
  monthlyRent: 1200000,
  rentPaymentDay: 25,
  startDate: '2026-12-01',
  endDate: '2028-11-30',
  landlordName: '김임대',
  propertyDisplayName: '잠실엘스 101동 1203호',
  sharedDocuments: [{ id: 'd-1', fileName: '임대차계약서_1203호.pdf', mimeType: 'application/pdf', sizeBytes: 1258291 }],
};
const TENANT = { id: 't-1', name: '이세입', email: 'sejip@example.com', role: 'TENANT' };
const LANDLORD = { id: 'l-1', name: '김임대', email: 'l@example.com', role: 'LANDLORD' };

const httpError = (status, code, details = []) =>
  Object.assign(new Error(code), { response: { status, data: { error: { code, message: `${code} 문구`, details } } } });

const LocationProbe = () => {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      <output data-testid="from">{location.state?.from ?? ''}</output>
    </>
  );
};
const where = () => screen.getByTestId('location').textContent;

const renderAt = (entry, user = null) => {
  useSessionStore.setState({ user, verifiedLegalDongCodes: [], isRestoring: false });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/invite/:token/*" element={<InviteRoutes />} />
        <Route path="*" element={<p>다른 화면</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getTenantInvitationPreview.mockResolvedValue(PREVIEW);
  api.getTenantInvitationContract.mockRejectedValue(httpError(403, 'INVITATION_VERIFY_REQUIRED'));
  api.postLogout.mockResolvedValue();
});

const typeDigits = async (digits) => {
  await userEvent.type(screen.getByLabelText('휴대폰 번호 뒤 4자리'), digits);
};

describe('로그인 전: B1 → B2 → B3', () => {
  it('B1 공개 요약은 금액 없이 임대인·인증·호실·기간·공유 파일 수·기한만', async () => {
    renderAt('/invite/tok');
    expect(await screen.findByRole('heading', { name: /김임대 님이/ })).toBeInTheDocument();
    expect(screen.getByText('소유자 인증')).toBeInTheDocument();
    expect(screen.getByText('잠실엘스 101동 1203호')).toBeInTheDocument();
    expect(screen.getByText('2026.12.01 ~ 2028.11.30')).toBeInTheDocument();
    expect(screen.getByText(/개가 함께 공유됐어요/)).toHaveTextContent('계약서 파일 4개가 함께 공유됐어요');
    expect(screen.getByText('초대 링크는 11월 18일까지 쓸 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/만 원/)).not.toBeInTheDocument();
  });

  it('referrer 를 보내지 않는 meta 를 두고, 떠나면 지운다', async () => {
    const view = renderAt('/invite/tok');
    await screen.findByRole('heading', { name: /김임대 님이/ });
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    view.unmount();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('본인 확인 → 계약서(B3) → [처음이에요] 초대 가입 / [계정이 있어요] 로그인(from 유지)', async () => {
    api.postTenantInvitationVerify.mockResolvedValue({});
    renderAt('/invite/tok');
    await userEvent.click(await screen.findByRole('button', { name: '계약서 확인하기' }));
    expect(await screen.findByRole('heading', { name: /임차인 본인인지/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
    await typeDigits('54');
    expect(screen.getByText('010-****-54__')).toBeInTheDocument();
    await typeDigits('32');
    api.getTenantInvitationContract.mockResolvedValue(CONTRACT);
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(api.postTenantInvitationVerify).toHaveBeenCalledWith('tok', { phoneLast4: '5432' });
    expect(await screen.findByText('5,000만 원')).toBeInTheDocument();
    expect(screen.getByText('120만 원 · 매월 25일')).toBeInTheDocument();
    expect(screen.getByText('임대차계약서_1203호.pdf')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '계정이 있어요 · 로그인' }));
    expect(where()).toBe('/login');
    expect(screen.getByTestId('from')).toHaveTextContent('/invite/tok');
  });

  it('[처음이에요 · 가입하고 추가] → /invite/:token/register', async () => {
    api.getTenantInvitationContract.mockResolvedValue(CONTRACT);
    renderAt('/invite/tok');
    // 확인 세션이 살아 있으면 B2 를 건너뛴다.
    await userEvent.click(await screen.findByRole('button', { name: '계약서 확인하기' }));
    await userEvent.click(await screen.findByRole('button', { name: '처음이에요 · 가입하고 추가' }));
    expect(where()).toBe('/invite/tok/register');
  });

  it('번호가 틀리면 B2 에 "번호가 맞지 않아요"', async () => {
    api.postTenantInvitationVerify.mockRejectedValue(httpError(422, 'INVITATION_VERIFY_FAILED'));
    renderAt('/invite/tok');
    await userEvent.click(await screen.findByRole('button', { name: '계약서 확인하기' }));
    await typeDigits('1111');
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('번호가 맞지 않아요');
  });

  it('단계 대기(429)면 "잠시 후 다시 시도해 주세요"와 남은 시간, 그동안 [확인]을 막는다', async () => {
    api.postTenantInvitationVerify.mockRejectedValue(
      httpError(429, 'INVITATION_VERIFY_RATE_LIMITED', [{ field: 'retryAfterSeconds', reason: 'WAIT', retryAfterSeconds: 30 }]),
    );
    renderAt('/invite/tok');
    await userEvent.click(await screen.findByRole('button', { name: '계약서 확인하기' }));
    await typeDigits('1111');
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('잠시 후 다시 시도해 주세요');
    expect(alert).toHaveTextContent('30초 뒤');
    await typeDigits('2222');
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });

  it('하루 한도(429 DAILY_LIMIT)면 B2b, 문의는 준비 중 안내(횟수 없음)', async () => {
    api.postTenantInvitationVerify.mockRejectedValue(httpError(429, 'INVITATION_VERIFY_DAILY_LIMIT', [{ retryAfterSeconds: 3600 }]));
    renderAt('/invite/tok');
    await userEvent.click(await screen.findByRole('button', { name: '계약서 확인하기' }));
    await typeDigits('1111');
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('heading', { name: '오늘은 더 확인할 수 없어요' })).toBeInTheDocument();
    expect(screen.queryByText(/\d+회/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '관리자에게 문의하기' }));
    expect(screen.getByText('문의 접수는 준비 중이에요')).toBeInTheDocument();
  });

  it('?oauth_error= 로 돌아오면 B1 에 문구를 보여 주고 주소에서 지운다', async () => {
    renderAt('/invite/tok?oauth_error=OAUTH_DENIED');
    expect(await screen.findByRole('alert')).toHaveTextContent('소셜 로그인을 취소했습니다');
    await waitFor(() => expect(where()).toBe('/invite/tok'));
  });
});

describe('예외 화면', () => {
  it.each([
    ['없는 초대 404', httpError(404, 'INVITATION_INVALID'), '쓸 수 없는 링크예요'],
    ['만료·취소 422', httpError(422, 'INVITATION_EXPIRED'), '쓸 수 없는 링크예요'],
    ['로그인 전 이미 수락 409', httpError(409, 'INVITATION_ALREADY_ACCEPTED'), '이미 추가된 링크예요'],
  ])('%s → F1', async (_name, error, title) => {
    api.getTenantInvitationPreview.mockRejectedValue(error);
    renderAt('/invite/tok');
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('임대인으로 로그인돼 있으면 F3, [로그아웃하고 계속]이면 이 초대의 B1 로', async () => {
    renderAt('/invite/tok', LANDLORD);
    expect(await screen.findByRole('heading', { name: '임차인 계정이 필요해요' })).toBeInTheDocument();
    expect(api.getTenantInvitationPreview).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '로그아웃하고 계속' }));
    expect(await screen.findByRole('heading', { name: /김임대 님이/ })).toBeInTheDocument();
    expect(where()).toBe('/invite/tok');
    expect(api.postLogout).toHaveBeenCalledTimes(1);
  });

  it('임차인 + 이미 수락된 초대 → F2 [내 계약 보기]', async () => {
    api.getTenantInvitationPreview.mockRejectedValue(httpError(409, 'INVITATION_ALREADY_ACCEPTED'));
    renderAt('/invite/tok', TENANT);
    expect(await screen.findByRole('heading', { name: '이미 추가한 계약이에요' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '내 계약 보기' }));
    expect(where()).toBe('/tenant/home');
  });
});

describe('로그인한 임차인: C2 → C3', () => {
  it('확인 세션이 있으면 바로 C2, [추가하기] → C3 → [홈으로]', async () => {
    api.getTenantInvitationContract.mockResolvedValue(CONTRACT);
    api.postTenantInvitationAccept.mockResolvedValue({ landlord: { name: '김임대' } });
    renderAt('/invite/tok', TENANT);
    expect(await screen.findByRole('heading', { name: /내 계약에 추가할까요/ })).toBeInTheDocument();
    expect(screen.getByText(/sejip@example.com 계정으로 추가돼요/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '추가하기' }));
    expect(api.postTenantInvitationAccept).toHaveBeenCalledWith('tok');
    expect(await screen.findByRole('heading', { name: '계약을 추가했어요' })).toBeInTheDocument();
    expect(screen.getByText(/이제 김임대 님과 연결됐어요/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '홈으로' }));
    expect(where()).toBe('/tenant/home');
  });

  it('확인 세션이 없으면 B1 → B2 → C2', async () => {
    api.postTenantInvitationVerify.mockResolvedValue({});
    renderAt('/invite/tok', TENANT);
    await userEvent.click(await screen.findByRole('button', { name: '계약서 확인하기' }));
    await typeDigits('5432');
    api.getTenantInvitationContract.mockResolvedValue(CONTRACT);
    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('heading', { name: /내 계약에 추가할까요/ })).toBeInTheDocument();
  });

  it('다른 임차인이 이미 연결(409 CONTRACT_TENANT_ALREADY_LINKED) → F1 모양', async () => {
    api.getTenantInvitationContract.mockResolvedValue(CONTRACT);
    api.postTenantInvitationAccept.mockRejectedValue(httpError(409, 'CONTRACT_TENANT_ALREADY_LINKED'));
    renderAt('/invite/tok', TENANT);
    await userEvent.click(await screen.findByRole('button', { name: '추가하기' }));
    expect(await screen.findByText(/이미 다른 계정과 연결돼 있어요/)).toBeInTheDocument();
  });

  it('가입하고 돌아오면(?joined=1, 이미 수락됨) C3', async () => {
    api.getTenantInvitationPreview.mockRejectedValue(httpError(409, 'INVITATION_ALREADY_ACCEPTED'));
    renderAt('/invite/tok?joined=1', TENANT);
    expect(await screen.findByRole('heading', { name: '계약을 추가했어요' })).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/invite/tok'));
  });
});

describe('초대 가입 /invite/:token/register', () => {
  it('기존 모바일 가입 화면을 그대로 그리고, 가입하면 초대 화면으로 돌아가 C3', async () => {
    renderAt('/invite/tok/register');
    // 기존 모바일 가입 화면(M02)의 제목 그대로
    const banner = await screen.findByRole('banner');
    expect(within(banner).getByRole('heading', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.queryByText('임대인 회원가입')).not.toBeInTheDocument();

    api.getTenantInvitationPreview.mockRejectedValue(httpError(409, 'INVITATION_ALREADY_ACCEPTED'));
    act(() => useSessionStore.getState().login({ user: TENANT, verifiedLegalDongCodes: [] }));
    expect(await screen.findByRole('heading', { name: '계약을 추가했어요' })).toBeInTheDocument();
  });

  it('임대인으로 로그인한 채 가입 주소를 열면 역할 홈으로(초대 주소는 TENANT 만)', async () => {
    renderAt('/invite/tok/register', LANDLORD);
    await waitFor(() => expect(where()).toBe('/landlord/home'));
  });
});
