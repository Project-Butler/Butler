import { useCallback, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LandlordLayout } from './layout/LandlordLayout';
import { LandlordDashboard } from './dashboard/LandlordDashboard';
import { BuildingListPage } from './pages/BuildingListPage';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { ContractEditPage } from './pages/ContractEditPage';
import { ContractListPage } from './pages/ContractListPage';
import { ContractRegisterPage } from './pages/ContractRegisterPage';
import { ManagementLogDetailPage } from './pages/ManagementLogDetailPage';
import { ManagementLogEditPage } from './pages/ManagementLogEditPage';
import { ManagementLogListPage } from './pages/ManagementLogListPage';
import { ManagementLogRegisterPage } from './pages/ManagementLogRegisterPage';
import { CommunityPage } from './pages/CommunityPage';
import { PropertyListPage } from './pages/PropertyListPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { PropertyRegisterPage } from './pages/PropertyRegisterPage';
import { PropertyVerifyPage } from './pages/PropertyVerifyPage';
import { SetupPage } from './pages/SetupPage';
import { SupportInquiryPage } from './pages/SupportInquiryPage';
import { DisputeChatPage } from './pages/DisputeChatPage';
import { DisputeHomePage } from './pages/DisputeHomePage';
import { DisputePage } from './pages/DisputePage';
import { DisputeReferenceDetailPage } from './pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from './pages/DisputeSearchPage';
import { DisputeTopicPage } from './pages/DisputeTopicPage';
import { RenewalDialog, toRenewalNotifications } from './components/RenewalDialog/RenewalDialog';
import { useGetContractList } from './hooks/useGetContractList';
import { useGetOwnershipRenewalNoticeList } from './hooks/useGetOwnershipRenewalNoticeList';
import { buildLocation, HOME_PATH, resolveViewKey } from './routes';

// 화면 전환은 react-router로 하고, 경로 표는 routes.js에 있다. 이 컴포넌트는 앱의 /landlord/* 아래에 놓인다(주소 접두어는 routes.js).
// 화면 컴포넌트는 그대로 onNavigate(key, params, { replace })로 이동한다. navigate가 key를 경로로 바꿔 준다.
// 로그인·세션·역할 확인은 앱 최상위(App, RequireRole)가 하고, 여기는 user 등을 props 로 받는다.

// 하위 화면은 사이드바에서 '내 부동산'을 선택된 메뉴로 보여 준다. 초기 세팅은 홈 아래.
const NAV_KEY_BY_VIEW = {
  properties: 'buildingList',
  propertyDetail: 'buildingList',
  propertyRegister: 'buildingList',
  propertyVerify: 'buildingList',
  contracts: 'leases',
  contractRegister: 'leases',
  contractEdit: 'leases',
  contractDetail: 'leases',
  logs: 'log',
  logRegister: 'log',
  logEdit: 'log',
  logDetail: 'log',
  propertyLogRegister: 'buildingList',
  setup: 'home',
  disputeReference: 'disputes',
  disputeChat: 'disputes',
  disputeSearch: 'disputes',
  disputeTopic: 'disputes',
};
const SUB_TITLE_BY_VIEW = {
  properties: '예전 소유',
  propertyDetail: '호실 상세',
  propertyRegister: '부동산 등록',
  propertyVerify: '권리자 인증',
  supportInquiry: '관리자 문의',
  contracts: '계약 목록',
  contractRegister: '계약 등록',
  contractEdit: '계약 수정',
  contractDetail: '계약 상세',
  logs: '기록 목록',
  logRegister: '기록 추가',
  logEdit: '기록 수정',
  logDetail: '기록 상세',
  propertyLogRegister: '기록 추가',
  setup: '초기 세팅',
  disputeSearch: '자료 찾기',
  disputeTopic: '상황별 안내',
  disputeReference: '사례 상세',
};

// 라우트 요소: 경로 파라미터를 화면 props로 옮긴다. id가 바뀌면 화면 상태를 새로 시작한다(key).
const BuildingListRoute = (pageProps) => {
  const { state } = useLocation();
  return <BuildingListPage params={{ notice: state?.notice }} {...pageProps} />;
};

const PropertyDetailRoute = (pageProps) => {
  const { propertyId } = useParams();
  return <PropertyDetailPage key={propertyId} propertyId={propertyId} {...pageProps} />;
};

const PropertyVerifyRoute = (pageProps) => {
  const { propertyId } = useParams();
  const { state } = useLocation();
  return <PropertyVerifyPage key={propertyId} propertyId={propertyId} notice={state?.notice} {...pageProps} />;
};

const PropertyListRoute = (pageProps) => {
  // 예전 소유 호실 등 관계별 호실 목록(내 부동산에서 들어온다)
  const [searchParams] = useSearchParams();
  return <PropertyListPage relation={searchParams.get('relation') ?? 'OWNER'} {...pageProps} />;
};

const ContractRegisterRoute = (pageProps) => {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? undefined;
  const renewFrom = searchParams.get('renewFrom') ?? undefined;
  // 미리 채울 값(호실·이전 계약)이 바뀌면 화면 상태를 새로 시작한다(key).
  return <ContractRegisterPage key={`${propertyId}-${renewFrom}`} params={{ propertyId, renewFrom }} {...pageProps} />;
};

const ContractDetailRoute = (pageProps) => {
  const { contractId } = useParams();
  return <ContractDetailPage key={contractId} contractId={contractId} {...pageProps} />;
};

const ContractEditRoute = (pageProps) => {
  const { contractId } = useParams();
  return <ContractEditPage key={contractId} contractId={contractId} {...pageProps} />;
};

const ManagementLogListRoute = (pageProps) => {
  const [searchParams] = useSearchParams();
  return <ManagementLogListPage propertyId={searchParams.get('propertyId') ?? undefined} {...pageProps} />;
};

const PropertyLogRegisterRoute = (pageProps) => {
  const { propertyId } = useParams();
  return <ManagementLogRegisterPage key={propertyId} propertyId={propertyId} {...pageProps} />;
};

const ManagementLogDetailRoute = (pageProps) => {
  const { logId } = useParams();
  return <ManagementLogDetailPage key={logId} logId={logId} {...pageProps} />;
};

const ManagementLogEditRoute = (pageProps) => {
  const { logId } = useParams();
  return <ManagementLogEditPage key={logId} logId={logId} {...pageProps} />;
};

// 사이드바 '계약' 배지 = 만료 임박(EXPIRING_SOON) 계약 수(D-17). 로그인한 뒤에만 그려서 조회한다.
// 계약 메뉴 배지 = 만료 임박 건수. 화면을 옮길 때마다 다시 세어 등록·해지 뒤에도 맞게 한다.
// 재인증 안내(종 아이콘 목록·만료 팝업)도 여기서 읽는다. 인증을 끝내거나 만료되면 다음 화면 이동 때 맞춰진다.
const LayoutWithBadges = ({ onUnauthorized, verifiedLegalDongCodes, onRefreshAuthMe, children, ...layoutProps }) => {
  const { pathname } = useLocation();
  const expiringSoon = useGetContractList({ status: 'EXPIRING_SOON', size: 1, activeOwnership: 'true' }, { onUnauthorized });
  const renewal = useGetOwnershipRenewalNoticeList({ verifiedLegalDongCodes }, { onUnauthorized });
  const { refetch } = expiringSoon;
  const { refetch: refetchRenewal } = renewal;
  const visitedPathRef = useRef(pathname);
  useEffect(() => {
    // 처음 그릴 때는 훅이 이미 불러오므로 경로가 바뀔 때만 다시 센다.
    if (visitedPathRef.current === pathname) return;
    visitedPathRef.current = pathname;
    refetch();
    refetchRenewal();
    onRefreshAuthMe();
  }, [pathname, refetch, refetchRenewal, onRefreshAuthMe]);

  const { onNavigate, user } = layoutProps;
  return (
    <LandlordLayout
      navBadges={{ leases: expiringSoon.data?.meta.total ?? 0 }}
      notifications={toRenewalNotifications(renewal.notices, onNavigate)}
      {...layoutProps}
    >
      {children}
      <RenewalDialog userId={user.id} notices={renewal.notices} onNavigate={onNavigate} />
    </LandlordLayout>
  );
};

export const LandlordWebRoutes = ({ user, verifiedLegalDongCodes, onLogout, onUnauthorized, onRefreshMe }) => {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  const navigate = useCallback(
    (key, params = {}, { replace = false } = {}) => {
      const { pathname, search = '', state } = buildLocation(key, params);
      const current = locationRef.current;
      // 이미 보고 있는 화면(같은 경로·쿼리)이면 기록을 더 쌓지 않는다.
      if (!replace && pathname === current.pathname && search === current.search) return;
      routerNavigate({ pathname, search }, { replace, state });
    },
    [routerNavigate],
  );

  const viewKey = resolveViewKey(location.pathname);
  const pageProps = { onNavigate: navigate, onUnauthorized, verifiedLegalDongCodes, onVerified: onRefreshMe };

  return (
    <LayoutWithBadges
      onUnauthorized={onUnauthorized}
      verifiedLegalDongCodes={verifiedLegalDongCodes}
      onRefreshAuthMe={onRefreshMe}
      user={user}
      onLogout={onLogout}
      activeKey={NAV_KEY_BY_VIEW[viewKey] ?? viewKey}
      subTitle={SUB_TITLE_BY_VIEW[viewKey]}
      onNavigate={navigate}
    >
      <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route path="/home" element={<LandlordDashboard userName={user.name} {...pageProps} />} />
        <Route path="/buildings" element={<BuildingListRoute {...pageProps} />} />
        <Route path="/properties" element={<PropertyListRoute {...pageProps} />} />
        <Route path="/properties/new" element={<PropertyRegisterPage {...pageProps} />} />
        <Route path="/properties/:propertyId" element={<PropertyDetailRoute {...pageProps} />} />
        <Route path="/properties/:propertyId/verify" element={<PropertyVerifyRoute {...pageProps} />} />
        <Route path="/support/inquiry" element={<SupportInquiryPage />} />
        <Route path="/contracts" element={<ContractListPage {...pageProps} />} />
        <Route path="/contracts/new" element={<ContractRegisterRoute {...pageProps} />} />
        <Route path="/contracts/:contractId" element={<ContractDetailRoute {...pageProps} />} />
        <Route path="/contracts/:contractId/edit" element={<ContractEditRoute {...pageProps} />} />
        <Route path="/logs" element={<ManagementLogListRoute {...pageProps} />} />
        <Route path="/logs/new" element={<ManagementLogRegisterPage {...pageProps} />} />
        <Route path="/logs/:logId" element={<ManagementLogDetailRoute {...pageProps} />} />
        <Route path="/logs/:logId/edit" element={<ManagementLogEditRoute {...pageProps} />} />
        <Route path="/properties/:propertyId/logs/new" element={<PropertyLogRegisterRoute {...pageProps} />} />
        <Route path="/setup" element={<SetupPage {...pageProps} />} />
        {/* 좁은 화면의 AI 상담(#2 담당 화면). 사례에서 넘긴 질문(history state draft)을 미리 채우는 건 담당자와 협의 후. */}
        <Route path="/disputes/chat" element={<DisputeChatPage />} />
        <Route path="/disputes" element={<DisputePage {...pageProps} />}>
          <Route index element={<DisputeHomePage />} />
          <Route path="search" element={<DisputeSearchPage />} />
          <Route path="topics/:topicKey" element={<DisputeTopicPage />} />
          <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
        </Route>
        <Route path="/community/*" element={<CommunityPage {...pageProps} />} />
        {/* 아직 화면이 없는 메뉴는 대시보드를 보여 준다(자리). */}
        <Route path="*" element={<LandlordDashboard userName={user.name} {...pageProps} />} />
      </Routes>
    </LayoutWithBadges>
  );
};
