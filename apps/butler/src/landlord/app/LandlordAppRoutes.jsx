import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ComingSoon } from '../../shared/ComingSoon';
import { SearchPage } from '../../shared/search/SearchPage';
import { buildLocation, HOME_PATH } from '../web/routes';
import { DisputeChatPage } from '../web/pages/DisputeChatPage';
import { DisputeHomePage } from '../web/pages/DisputeHomePage';
import { DisputeReferenceDetailPage } from '../web/pages/DisputeReferenceDetailPage';
import { DisputeSearchPage } from '../web/pages/DisputeSearchPage';
import { DisputeTopicPage } from '../web/pages/DisputeTopicPage';
import { useHistoryDraft } from '../web/hooks/useHistoryDraft';
import { AppTabShell } from './components/AppTabShell/AppTabShell';
import { DisputeAppLayout, DisputeChatAppScreen } from './components/DisputeAppLayout/DisputeAppLayout';
import { CommunityAppLayout } from './components/CommunityAppLayout/CommunityAppLayout';
import { BuildingListPage } from './pages/BuildingListPage';
import { ContractDetailPage } from './pages/ContractDetailPage';
import { ContractEditPage } from './pages/ContractEditPage';
import { ContractRegisterPage } from './pages/ContractRegisterPage';
import { DocumentBoxPage } from './pages/DocumentBoxPage';
import { HomePage } from './pages/HomePage';
import { ManagementLogListPage } from './pages/ManagementLogListPage';
import { MyInfoPage } from './pages/MyInfoPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { PropertyRegisterPage } from './pages/PropertyRegisterPage';
import { SchedulePage } from './pages/SchedulePage';
import { ThreadListPage } from './pages/ThreadListPage';
import { ThreadPage } from './pages/ThreadPage';
import { TenantInvitePage } from './pages/TenantInvitePage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { TicketListPage } from './pages/TicketListPage';
import { TicketRegisterPage } from './pages/TicketRegisterPage';
import { VerifyPage } from './pages/VerifyPage';
import { useNotificationUnreadCount } from '../../shared/notifications/useNotificationUnreadCount';
import { useGetThreadUnreadCount } from '../../shared/threads/useGetThreadUnreadCount';
import { isTabActive, SETTINGS_PATH, TABS } from './tabs';
import { parseCategoryParam } from './utils/documentBoxView';
import { useGoBack, useGoTo } from './utils/navigation';

// 탭이 있는 앱 화면(홈형 상단 바 + 하단 탭). 앱 화면이 아직 없는 주소는 모두 앱 셸 안의 "준비 중"이다.
// 상단 바 아바타의 이름은 '내 계정'이다(하단 탭 '내 정보'와 같은 이름의 버튼이 둘 생기지 않게).
// 홈형 상단 바: 종(안 읽은 알림 수)을 누르면 일정·알림의 알림 탭으로, 아바타(내 계정)를 누르면 내 정보로 간다.
// 말풍선(안 읽은 메시지가 있는 대화 수, 30초마다 새로 받음)을 누르면 대화 목록으로 간다.
export const useHomeTopBar = (user, onUnauthorized) => {
  const navigate = useNavigate();
  const unreadCount = useNotificationUnreadCount({ onUnauthorized });
  const threadUnreadCount = useGetThreadUnreadCount({ onUnauthorized });
  return {
    search: { onClick: () => navigate(buildLocation('search')) },
    message: { count: threadUnreadCount, onClick: () => navigate(buildLocation('threads')) },
    notification: { count: unreadCount, onClick: () => navigate(buildLocation('schedules', { tab: 'notifications' })) },
    avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) },
  };
};

const HomeTopBarShell = ({ user, onUnauthorized, children }) => (
  <AppTabShell topBar={useHomeTopBar(user, onUnauthorized)}>{children}</AppTabShell>
);

const BuildingListRoute = ({ user, onUnauthorized }) => (
  <BuildingListPage topBar={useHomeTopBar(user, onUnauthorized)} onUnauthorized={onUnauthorized} />
);

const TabScreens = ({ user, verifiedLegalDongCodes, onLogout, onUnauthorized }) => {
  const { pathname } = useLocation();
  const current = TABS.find((tab) => isTabActive(tab, pathname));

  return (
    <HomeTopBarShell user={user} onUnauthorized={onUnauthorized}>
      <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route path="/home" element={<HomePage user={user} onUnauthorized={onUnauthorized} />} />
        <Route
          path="/settings"
          element={<MyInfoPage user={user} verifiedLegalDongCodes={verifiedLegalDongCodes} onLogout={onLogout} onUnauthorized={onUnauthorized} />}
        />
        <Route path="*" element={<ComingSoon title={current?.label ?? '준비 중인 화면'} />} />
      </Routes>
    </HomeTopBarShell>
  );
};

// 주소의 id 가 바뀌면 화면을 새로 시작한다(앞 호실·계약의 상태가 남지 않게).
const PropertyDetailRoute = ({ verifiedLegalDongCodes, onRefreshMe, onUnauthorized }) => {
  const { propertyId } = useParams();
  return (
    <PropertyDetailPage
      key={propertyId}
      propertyId={propertyId}
      verifiedLegalDongCodes={verifiedLegalDongCodes}
      onVerified={onRefreshMe}
      onUnauthorized={onUnauthorized}
    />
  );
};

// 권리자 인증. 등록 직후 안내(notice)는 history state 로만 온다(웹 routes.js propertyVerify 와 같다).
const VerifyRoute = ({ onRefreshMe, onUnauthorized }) => {
  const { propertyId } = useParams();
  const location = useLocation();
  return (
    <VerifyPage key={propertyId} propertyId={propertyId} notice={location.state?.notice} onVerified={onRefreshMe} onUnauthorized={onUnauthorized} />
  );
};

// 계약 등록. 미리 고를 호실(propertyId)·갱신할 이전 계약(renewFrom)은 주소에 남긴다(웹 routes.js contractRegister 와 같다).
// 둘이 바뀌면 화면을 새로 시작한다.
const ContractRegisterRoute = ({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? undefined;
  const renewFrom = searchParams.get('renewFrom') ?? undefined;
  return <ContractRegisterPage key={`${propertyId}-${renewFrom}`} propertyId={propertyId} renewFrom={renewFrom} onUnauthorized={onUnauthorized} />;
};

const ContractDetailRoute = ({ onUnauthorized }) => {
  const { contractId } = useParams();
  return <ContractDetailPage key={contractId} contractId={contractId} onUnauthorized={onUnauthorized} />;
};

const ContractEditRoute = ({ onUnauthorized }) => {
  const { contractId } = useParams();
  return <ContractEditPage key={contractId} contractId={contractId} onUnauthorized={onUnauthorized} />;
};

const TenantInviteRoute = ({ onUnauthorized }) => {
  const { contractId } = useParams();
  return <TenantInvitePage key={contractId} contractId={contractId} onUnauthorized={onUnauthorized} />;
};

const ManagementLogListRoute = ({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  return <ManagementLogListPage propertyId={searchParams.get('propertyId') ?? undefined} onUnauthorized={onUnauthorized} />;
};

// AI 상담: 사례 상세·상황 안내에서 넘긴 질문(history state draft)을 입력창에 미리 채운다(웹 DisputeChatRoute 와 같다).
const DisputeChatRoute = () => (
  <DisputeChatAppScreen>
    <DisputeChatPage isApp initialDraft={useHistoryDraft()} />
  </DisputeChatAppScreen>
);

const TicketListRoute = ({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? undefined;
  return <TicketListPage key={propertyId} propertyId={propertyId} onUnauthorized={onUnauthorized} />;
};

const TicketRegisterRoute = ({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  return <TicketRegisterPage propertyId={searchParams.get('propertyId') ?? undefined} onUnauthorized={onUnauthorized} />;
};

// 목록의 [완료 처리]로 오면 history state 의 complete 로 완료 시트를 바로 연다.
const TicketDetailRoute = ({ onUnauthorized }) => {
  const { ticketId } = useParams();
  const location = useLocation();
  return <TicketDetailPage key={ticketId} ticketId={ticketId} openComplete={Boolean(location.state?.complete)} onUnauthorized={onUnauthorized} />;
};

// 호실(propertyId)과 종류 목록(type)은 주소에 남긴다. 호실이 바뀌면 화면을 새로 시작한다.
const DocumentBoxRoute = ({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? undefined;
  return (
    <DocumentBoxPage
      key={propertyId}
      propertyId={propertyId}
      category={parseCategoryParam(searchParams.get('type'))}
      onUnauthorized={onUnauthorized}
    />
  );
};

// 일정·알림(#163). 알림 탭이면 ?tab=notifications.
const ScheduleRoute = ({ onUnauthorized }) => {
  const [searchParams] = useSearchParams();
  return <SchedulePage tab={searchParams.get('tab') === 'notifications' ? 'notifications' : 'schedules'} onUnauthorized={onUnauthorized} />;
};

// 통합 검색(M13, #172). 결과를 누르면 그 항목의 앱 화면으로 간다(하우스 로그·문서는 그 호실로 거른 목록).
const toLandlordTarget = (sectionKey, item) => {
  switch (sectionKey) {
    case 'properties':
      return ['propertyDetail', { propertyId: item.id }];
    case 'contracts':
      return ['contractDetail', { contractId: item.id }];
    case 'tickets':
      return ['ticketDetail', { ticketId: item.id }];
    case 'managementLogs':
      return ['logs', { propertyId: item.property.id }];
    case 'documents':
      return ['documents', { propertyId: item.property?.id }];
    case 'schedules':
      return item.related?.resourceType === 'CONTRACT' ? ['contractDetail', { contractId: item.related.resourceId }] : ['schedules', {}];
    default:
      return ['home', {}];
  }
};

// 임대차 분쟁: 첫 화면은 하단 탭 '분쟁 센터'의 첫 화면이라 다른 탭 첫 화면과 같은 홈형 상단 바를 넘긴다.
const DisputeLayoutRoute = ({ user, onUnauthorized }) => (
  <DisputeAppLayout topBar={useHomeTopBar(user, onUnauthorized)} onUnauthorized={onUnauthorized} />
);

const SearchRoute = ({ user, onUnauthorized }) => {
  const goBack = useGoBack('home');
  const goTo = useGoTo();
  return (
    <SearchPage
      userId={user.id}
      shell="landlord-app"
      onBack={goBack}
      onOpen={(sectionKey, item) => goTo(...toLandlordTarget(sectionKey, item))}
      onUnauthorized={onUnauthorized}
    />
  );
};

const ThreadRoute = ({ user, onUnauthorized }) => {
  const { threadId } = useParams();
  return <ThreadPage key={threadId} threadId={threadId} user={user} onUnauthorized={onUnauthorized} />;
};

// 임대인 앱 화면. 이 컴포넌트는 앱의 /landlord/* 아래에 놓인다(주소는 웹과 같고 화면만 다르다).
// 홈(M03)은 탭 화면 안에 둔다. 상단 바가 화면마다 다른 내 자산(M05)·부동산 상세(M06)·하우스 로그(M08)는 화면이 직접 탭 셸을 그리고,
// 부동산 등록(M04)·계약 관리(M07)·계약 등록·계약 수정·임차인 초대(M15)처럼 하단 탭이 없는 화면은 탭 셸 밖에 놓는다.
// 수리·점검 목록(M09)은 탭 셸을 직접 그리고, 요청 상세·등록·소통(M10)은 하단 탭 없이 고정 버튼 바를 쓴다. 문서함(M11)도 탭 셸을 직접 그린다.
// 일정·알림(#163)은 홈형 상단 바의 종에서 들어오고, 하단 탭 없이 뒤로 가기 상단 바를 쓴다. 통합 검색(M13)은 상단 바의 돋보기에서 들어오고 검색창 상단 바만 있다.
// 권리자 인증(/properties/:id/verify)은 하단 탭 없는 전체 화면이다. 휴대폰 본인인증(리디렉션)도 이 주소로 돌아온다.
// 아래에 없는 하위 주소(/logs/:id 등)는 탭 화면의 "준비 중"으로 간다.
// 로그인·세션은 앱 최상위가 하고, 여기는 user·verifiedLegalDongCodes·onLogout·onUnauthorized·onRefreshMe 를 props 로 받는다.
export const LandlordAppRoutes = ({ user, verifiedLegalDongCodes, onLogout, onUnauthorized, onRefreshMe }) => (
  <Routes>
    <Route path="/properties/new" element={<PropertyRegisterPage onUnauthorized={onUnauthorized} />} />
    <Route path="/buildings" element={<BuildingListRoute user={user} onUnauthorized={onUnauthorized} />} />
    <Route
      path="/properties/:propertyId"
      element={<PropertyDetailRoute verifiedLegalDongCodes={verifiedLegalDongCodes} onRefreshMe={onRefreshMe} onUnauthorized={onUnauthorized} />}
    />
    <Route path="/properties/:propertyId/verify" element={<VerifyRoute onRefreshMe={onRefreshMe} onUnauthorized={onUnauthorized} />} />
    {/* /contracts/:contractId 가 'new'를 계약 id 로 읽지 않게 앞에 둔다. */}
    <Route path="/contracts/new" element={<ContractRegisterRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/contracts/:contractId" element={<ContractDetailRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/contracts/:contractId/edit" element={<ContractEditRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/contracts/:contractId/invite" element={<TenantInviteRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/logs" element={<ManagementLogListRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/tickets" element={<TicketListRoute onUnauthorized={onUnauthorized} />} />
    {/* /tickets/:ticketId 가 'new'를 요청 id 로 읽지 않게 앞에 둔다. */}
    <Route path="/tickets/new" element={<TicketRegisterRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/tickets/:ticketId" element={<TicketDetailRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/threads" element={<ThreadListPage user={user} onUnauthorized={onUnauthorized} />} />
    <Route path="/threads/:threadId" element={<ThreadRoute user={user} onUnauthorized={onUnauthorized} />} />
    <Route path="/documents" element={<DocumentBoxRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/schedules" element={<ScheduleRoute onUnauthorized={onUnauthorized} />} />
    <Route path="/search" element={<SearchRoute user={user} onUnauthorized={onUnauthorized} />} />
    {/* 임대차 분쟁(3팀): 웹과 같은 페이지에 앱 틀만 씌운다(DisputeAppLayout). */}
    <Route path="/disputes/chat" element={<DisputeChatRoute />} />
    <Route path="/disputes" element={<DisputeLayoutRoute user={user} onUnauthorized={onUnauthorized} />}>
      <Route index element={<DisputeHomePage />} />
      <Route path="search" element={<DisputeSearchPage />} />
      <Route path="topics/:topicKey" element={<DisputeTopicPage />} />
      <Route path="references/:referenceId" element={<DisputeReferenceDetailPage />} />
    </Route>
    <Route path="/community/*" element={<CommunityAppLayout user={user} onUnauthorized={onUnauthorized} />} />
    <Route
      path="*"
      element={<TabScreens user={user} verifiedLegalDongCodes={verifiedLegalDongCodes} onLogout={onLogout} onUnauthorized={onUnauthorized} />}
    />
  </Routes>
);
