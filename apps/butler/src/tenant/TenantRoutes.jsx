import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MobileShell } from '@butler/ui';
import { AccountCard } from '../shared/AccountCard';
import { ComingSoon } from '../shared/ComingSoon';
import { useNotificationUnreadCount } from '../shared/notifications/useNotificationUnreadCount';
import { SearchPage } from '../shared/search/SearchPage';
import { useTenantTabs } from './hooks/useTenantTabs';
import { ContractPage } from './pages/ContractPage';
import { HomePage } from './pages/HomePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { TicketFormPage } from './pages/TicketFormPage';
import { TicketListPage } from './pages/TicketListPage';
import { TicketSentPage } from './pages/TicketSentPage';
import { contractPath, HOME_PATH, NOTIFICATIONS_PATH, SEARCH_PATH, SETTINGS_PATH, ticketPath, TICKETS_PATH } from './routes';

// 탭이 있는 화면(홈 · 수리 요청 · 내 정보). 위 막대: 검색 · 알림(안 읽은 수) · 내 계정.
const TabScreens = ({ user, onLogout, onUnauthorized }) => {
  const navigate = useNavigate();
  const tabs = useTenantTabs();
  const unreadCount = useNotificationUnreadCount({ onUnauthorized });

  return (
    <MobileShell
      shell="tenant"
      topBar={{
        search: { onClick: () => navigate(SEARCH_PATH) },
        notification: { count: unreadCount, onClick: () => navigate(NOTIFICATIONS_PATH) },
        avatar: { name: user.name, label: '내 계정', onClick: () => navigate(SETTINGS_PATH) },
      }}
      tabs={tabs}
    >
      <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route path="/home" element={<HomePage user={user} onUnauthorized={onUnauthorized} />} />
        <Route path="/tickets" element={<TicketListPage onUnauthorized={onUnauthorized} />} />
        <Route path="/tickets/:ticketId/sent" element={<TicketSentPage />} />
        <Route
          path="/settings"
          element={
            <ComingSoon title="내 정보">
              <AccountCard user={user} onLogout={onLogout} />
            </ComingSoon>
          }
        />
        <Route path="*" element={<ComingSoon title="준비 중인 화면" />} />
      </Routes>
    </MobileShell>
  );
};

// 통합 검색(M13, #172) 결과를 누르면 갈 주소. 수리 요청과 그 첨부 문서는 요청 상세로, 계약 문서는 계약서 화면으로 보낸다.
const toSearchResultPath = (sectionKey, item) => {
  switch (sectionKey) {
    case 'properties':
      return item.currentContract ? contractPath(item.currentContract.id) : HOME_PATH;
    case 'documents':
      if (item.resourceType === 'CONTRACT') return contractPath(item.resourceId);
      return item.resourceType === 'TICKET' ? ticketPath(item.resourceId) : TICKETS_PATH;
    case 'schedules':
      return item.related?.resourceType === 'CONTRACT' ? contractPath(item.related.resourceId) : HOME_PATH;
    case 'tickets':
      return item.id ? ticketPath(item.id) : TICKETS_PATH;
    default:
      return HOME_PATH;
  }
};

const SearchRoute = ({ user, onUnauthorized }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // 주소로 바로 들어와 이전 화면이 없으면 홈으로
  const goBack = () => (location.key === 'default' ? navigate(HOME_PATH, { replace: true }) : navigate(-1));
  return (
    <SearchPage
      userId={user.id}
      shell="tenant"
      onBack={goBack}
      onOpen={(sectionKey, item) => navigate(toSearchResultPath(sectionKey, item))}
      onUnauthorized={onUnauthorized}
    />
  );
};

// 임차인 앱 화면: 항상 앱 셸(PC 에서는 가운데 모바일 폭). 하단 탭 홈 · 수리 요청 · 내 정보.
// 입력 화면(요청하기·고치기)과 계약서는 뒤로 가기 바만, 요청 상세·알림은 뒤로 가기 바 + 하단 탭(접수 상태 상세는 아래 고정 버튼).
// 이 컴포넌트는 앱의 /tenant/* 아래에 놓인다. 로그인·세션은 앱 최상위가 하고, 여기는 user·onLogout·onUnauthorized 를 props 로 받는다.
export const TenantRoutes = ({ user, onLogout, onUnauthorized }) => (
  <Routes>
    <Route path="/contracts/:contractId" element={<ContractPage onUnauthorized={onUnauthorized} />} />
    <Route path="/search" element={<SearchRoute user={user} onUnauthorized={onUnauthorized} />} />
    <Route path="/notifications" element={<NotificationsPage onUnauthorized={onUnauthorized} />} />
    <Route path="/tickets/new" element={<TicketFormPage onUnauthorized={onUnauthorized} />} />
    <Route path="/tickets/:ticketId/edit" element={<TicketFormPage onUnauthorized={onUnauthorized} />} />
    <Route path="/tickets/:ticketId" element={<TicketDetailPage onUnauthorized={onUnauthorized} />} />
    <Route path="*" element={<TabScreens user={user} onLogout={onLogout} onUnauthorized={onUnauthorized} />} />
  </Routes>
);
