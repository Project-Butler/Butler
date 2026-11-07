// 부동산 등록: 웹(PropertyRegisterPage)과 앱(M04, Figma 3:202)이 같은 입력 항목·검증·API(postProperty)를 쓰는지 같은 시나리오로 확인한다.
// 다른 것은 화면 모양과 저장 뒤 이동뿐이다 — 웹은 권리자 인증 화면, 앱은 앱 홈 + "부동산을 등록했어요" 안내(history state).
// 주소 검색 창(AddressSearchDialog)은 대역으로 바꿔 "고르면 onResolved(단지)"만 흉내 낸다(검색 자체는 이 테스트 밖).
// 실패 조건: 두 화면이 보내는 바디가 다름 · 필수(주소·호·동 선택) 없이 보내짐 · 서버 칸 오류가 안 보임 · 저장 뒤 엉뚱한 곳으로 감.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  postProperty: vi.fn(),
  getContractList: vi.fn(),
  getPropertyList: vi.fn(),
  getPropertyOwnershipList: vi.fn(),
}));
vi.mock('@butler/api-client', () => api);

const picked = vi.hoisted(() => ({ complex: null }));
vi.mock('../../src/landlord/web/components/AddressSearchDialog/AddressSearchDialog', () => ({
  AddressSearchDialog: ({ onResolved, onClose }) => (
    <div role="dialog" aria-label="주소 검색">
      <button type="button" onClick={() => onResolved(picked.complex)}>
        주소 고르기(대역)
      </button>
      <button type="button" onClick={onClose}>
        닫기(대역)
      </button>
      {/* 실제 검색 창처럼 안에 form 이 있다. 제출 이벤트가 등록 form 으로 새면 안 된다. */}
      <form onSubmit={(event) => event.preventDefault()}>
        <button type="submit">검색(대역)</button>
      </form>
    </div>
  ),
}));

const { PropertyRegisterPage } = await import('../../src/landlord/web/pages/PropertyRegisterPage');
const { LandlordAppRoutes } = await import('../../src/landlord/app/LandlordAppRoutes');

const COMPLEX = { id: 'cx-1', name: '래미안아파트', roadAddress: '서울 강남구 테헤란로 1', jibunAddress: '서울 강남구 역삼동 1', zipCode: '06000', detailBuildingNames: [] };
const COMPLEX_WITH_DONGS = { ...COMPLEX, detailBuildingNames: ['101동', '102동'] };
const USER = { id: 'l-1', name: '최앱주', email: 'landapp@butler.test', role: 'LANDLORD' };

const LocationProbe = () => {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}|${JSON.stringify(location.state)}`}</p>;
};

// 웹: 페이지를 바로 그린다(onNavigate 로 이동을 본다). 앱: 실제 앱 라우트로 /landlord/properties/new 에 들어간다.
const SURFACES = {
  web: () => {
    const onNavigate = vi.fn();
    render(<PropertyRegisterPage onNavigate={onNavigate} onUnauthorized={vi.fn()} />);
    return { onNavigate };
  },
  app: () => {
    render(
      <MemoryRouter initialEntries={['/landlord/properties/new']}>
        <Routes>
          <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    return {};
  },
};

const chooseAddress = async (complex = COMPLEX) => {
  picked.complex = complex;
  await userEvent.click(screen.getByRole('button', { name: /주소를 검색해 주세요|^검색$/ }));
  await userEvent.click(within(screen.getByRole('dialog', { name: '주소 검색' })).getByRole('button', { name: '주소 고르기(대역)' }));
};
// '동이 없는 건물이에요' 체크박스와 구분한다. 동 목록이 있으면 '동*'(필수), 없으면 '동 (선택)'.
const DONG_LABEL = /^동( \(선택\))?\*?$/;
const submitButton = () => screen.getByRole('button', { name: '등록' });

beforeEach(() => {
  vi.clearAllMocks();
  api.postProperty.mockResolvedValue({ property: { id: 'new-p', displayName: '래미안아파트 1203호', exclusiveArea: null, floor: null } });
  const empty = { data: [], meta: { page: 1, size: 100, total: 0, hasNext: false } };
  api.getContractList.mockResolvedValue(empty);
  api.getPropertyList.mockResolvedValue(empty);
  api.getPropertyOwnershipList.mockResolvedValue(empty);
});

describe.each(Object.keys(SURFACES))('부동산 등록 (%s)', (surface) => {
  const renderPage = SURFACES[surface];

  it('주소를 고르고 호를 넣기 전에는 [등록]을 누를 수 없다', async () => {
    renderPage();
    expect(submitButton()).toBeDisabled();
    await chooseAddress();
    expect(submitButton()).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    expect(submitButton()).toBeEnabled();
  });

  it('필수만 넣으면 { complexId, buildingNo: "", unitNo } 만 보낸다(선택 칸은 보내지 않는다)', async () => {
    renderPage();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.click(submitButton());

    await waitFor(() => expect(api.postProperty).toHaveBeenCalledTimes(1));
    expect(api.postProperty).toHaveBeenCalledWith({ complexId: 'cx-1', buildingNo: '', unitNo: '1203' });
  });

  it('선택 칸(동·층·전용면적·방 구성·설비·기타 설비)은 웹과 같은 모양으로 보낸다', async () => {
    renderPage();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(DONG_LABEL), '101');
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.type(screen.getByLabelText(/^층/), 'B1');
    await userEvent.type(screen.getByLabelText(/^전용면적/), '39.78');
    await userEvent.selectOptions(screen.getByLabelText(/^방 구성/), 'TWO_ROOM');
    await userEvent.click(screen.getByLabelText('에어컨'));
    await userEvent.click(screen.getByLabelText('냉장고'));
    await userEvent.type(screen.getByLabelText(/^기타 설비/), '블라인드');
    await userEvent.click(submitButton());

    await waitFor(() => expect(api.postProperty).toHaveBeenCalledTimes(1));
    expect(api.postProperty).toHaveBeenCalledWith({
      complexId: 'cx-1',
      buildingNo: '101',
      unitNo: '1203',
      floor: -1,
      exclusiveArea: 39.78,
      unitType: 'TWO_ROOM',
      equipment: ['AIR_CONDITIONER', 'REFRIGERATOR'],
      equipmentEtc: '블라인드',
    });
  });

  it('주소에 동 목록이 있으면 동을 골라야 [등록]할 수 있고, 고른 이름을 그대로 보낸다', async () => {
    renderPage();
    await chooseAddress(COMPLEX_WITH_DONGS);
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    expect(submitButton()).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(DONG_LABEL), '102동');
    await userEvent.click(submitButton());

    await waitFor(() => expect(api.postProperty).toHaveBeenCalledWith({ complexId: 'cx-1', buildingNo: '102동', unitNo: '1203' }));
  });

  it('전용면적 형식이 틀리면 칸 아래에 오류를 보여 주고 [등록]을 막는다', async () => {
    renderPage();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.type(screen.getByLabelText(/^전용면적/), '84.9.');

    expect(screen.getByLabelText(/^전용면적/)).toHaveAttribute('aria-invalid', 'true');
    expect(submitButton()).toBeDisabled();
  });

  it('서버가 칸 오류(400 details)를 주면 그 칸 아래에 보여 준다', async () => {
    api.postProperty.mockRejectedValue(
      Object.assign(new Error('x'), {
        response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: '입력값 오류', details: [{ field: 'unitNo', reason: '이미 등록한 호실이에요.' }] } } },
      }),
    );
    renderPage();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.click(submitButton());

    expect(await screen.findByText('이미 등록한 호실이에요.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^호/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('칸에 붙일 수 없는 오류는 서버 문구를 그대로 보여 준다', async () => {
    api.postProperty.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { error: { code: 'CONFLICT', message: '잠시 후 다시 시도해 주세요.' } } } }),
    );
    renderPage();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.click(submitButton());

    expect(await screen.findByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });
});

describe('부동산 등록 뒤 이동', () => {
  it('웹: 권리자 인증 화면으로 간다(기록 바꿈)', async () => {
    const { onNavigate } = SURFACES.web();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.click(submitButton());

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('propertyVerify', { propertyId: 'new-p' }, { replace: true }));
  });

  it('앱: 앱 홈으로 가서 "부동산을 등록했어요"를 한 번 보여 준다', async () => {
    SURFACES.app();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.click(submitButton());

    expect(await screen.findByRole('status')).toHaveTextContent('부동산을 등록했어요');
    expect(screen.getByTestId('location').textContent.split('|')[0]).toBe('/landlord/home');
    expect(screen.queryByRole('button', { name: '등록' })).toBeNull();
  });

  it('앱: 다른 임대인이 먼저 넣은 면적·층을 썼으면 그 안내도 함께 보여 준다(웹과 같은 문구)', async () => {
    api.postProperty.mockResolvedValue({ property: { id: 'new-p', displayName: '래미안아파트 1203호', exclusiveArea: 84.97, floor: 12 } });
    SURFACES.app();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.type(screen.getByLabelText(/^전용면적/), '39.78');
    await userEvent.click(submitButton());

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('부동산을 등록했어요');
    expect(status).toHaveTextContent('이미 등록된 값이 있어 그 값을 보여 줍니다(면적 84.97㎡)');
  });
});

describe('앱 부동산 등록(M04) 화면', () => {
  it('주소 검색 창 안에서 검색(제출)해도 부동산 등록은 보내지 않는다(검색 창은 등록 form 밖)', async () => {
    SURFACES.app();
    await chooseAddress();
    await userEvent.type(screen.getByLabelText(/^호/), '1203');
    await userEvent.click(screen.getByRole('button', { name: /^검색$/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: '주소 검색' })).getByRole('button', { name: '검색(대역)' }));

    expect(api.postProperty).not.toHaveBeenCalled();
  });

  it('하단 탭 없이 뒤로 가기 상단 바(부동산 등록)와 권리자 인증 안내를 보여 주고, 저장할 곳 없는 "유형"은 없다', () => {
    SURFACES.app();
    expect(screen.getByRole('heading', { name: '부동산 등록' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '하단 메뉴' })).toBeNull();
    expect(screen.getByText('권리자 인증 안내')).toBeInTheDocument();
    expect(screen.queryByText('유형')).toBeNull();
    expect(screen.queryByText('아파트')).toBeNull();
  });

  it('주소를 고르면 단지명과 주소를 보여 준다', async () => {
    SURFACES.app();
    await chooseAddress();
    expect(screen.getByLabelText('단지명')).toHaveValue('래미안아파트');
    expect(screen.getByText('서울 강남구 테헤란로 1')).toBeInTheDocument();
  });

  it('뒤로 가기는 이전 화면(홈)으로 돌아간다', async () => {
    render(
      <MemoryRouter initialEntries={['/landlord/home', '/landlord/properties/new']} initialIndex={1}>
        <Routes>
          <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(screen.getByTestId('location').textContent.split('|')[0]).toBe('/landlord/home');
  });

  it('주소로 바로 들어와 이전 기록이 없으면, 뒤로 가기는 홈으로 간다(앱 밖으로 나가거나 멈추지 않는다)', async () => {
    SURFACES.app(); // 기록 한 칸짜리 MemoryRouter 가 '주소로 바로 들어온' 경우와 같다
    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(screen.getByTestId('location').textContent.split('|')[0]).toBe('/landlord/home');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('오늘 확인할 일');
  });

  it('홈으로 대신 갈 때는 기록을 바꿔서(replace), 브라우저 뒤로 가기를 해도 등록 화면이 다시 나오지 않는다', async () => {
    const HistoryBack = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(-1)}>
          브라우저 뒤로(대역)
        </button>
      );
    };
    render(
      <MemoryRouter initialEntries={['/landlord/properties/new']}>
        <Routes>
          <Route path="/landlord/*" element={<LandlordAppRoutes user={USER} onLogout={vi.fn()} onUnauthorized={vi.fn()} />} />
        </Routes>
        <LocationProbe />
        <HistoryBack />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(screen.getByTestId('location').textContent.split('|')[0]).toBe('/landlord/home');

    await userEvent.click(screen.getByRole('button', { name: '브라우저 뒤로(대역)' })); // push 였다면 여기서 등록 화면으로 돌아간다
    expect(screen.getByTestId('location').textContent.split('|')[0]).toBe('/landlord/home');
  });
});
