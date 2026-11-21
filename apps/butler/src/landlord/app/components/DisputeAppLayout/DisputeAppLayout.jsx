import { useCallback } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { MobileFormLayout } from '@butler/ui';
import { DisputePage } from '../../../web/pages/DisputePage';
import { BASE_PATH, buildLocation } from '../../../web/routes';
import { findTopic } from '../../../web/utils/disputeReference';
import { useGoBack } from '../../utils/navigation';
import { AppTabShell } from '../AppTabShell/AppTabShell';

const DISPUTES_PATH = `${BASE_PATH}/disputes`;

// 상단 바 제목. 웹 breadcrumb 끝 이름(SUB_TITLE_BY_VIEW)과 같게, 상황 안내는 그 상황 이름.
const titleOf = (pathname) => {
  const topic = matchPath(`${DISPUTES_PATH}/topics/:topicKey`, pathname);
  if (topic) return findTopic(topic.params.topicKey)?.label ?? '상황별 안내';
  if (matchPath(`${DISPUTES_PATH}/search`, pathname)) return '자료 찾기';
  if (matchPath(`${DISPUTES_PATH}/references/:referenceId`, pathname)) return '사례 상세';
  return '임대차 분쟁 센터';
};

// 임대차 분쟁(3팀 피처)의 앱 화면 틀. 하위 화면은 웹과 같은 페이지(DisputePage의 Outlet)를 쓰고, 틀과 제목 줄만 앱 것으로 바꾼다.
// 모든 분쟁 화면은 하단 탭이 있는 뒤로 가기 화면(M06·M08과 같은 AppTabShell backBar). 사례 상세의 [AI로 내 상황에 적용해 보기]도 고정이 아니라 맨 아래라 탭과 겹치지 않는다.
export const DisputeAppLayout = ({ onUnauthorized }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // 웹(LandlordWebRoutes)의 onNavigate와 같은 약속: 화면 key → routes.js 경로, 이미 보고 있는 화면이면 기록을 쌓지 않는다.
  const onNavigate = useCallback(
    (key, params = {}, { replace = false } = {}) => {
      const { pathname, search = '', state } = buildLocation(key, params);
      if (!replace && pathname === location.pathname && search === location.search) return;
      navigate({ pathname, search }, { replace, state });
    },
    [navigate, location.pathname, location.search],
  );

  // 뒤로: 앱 안에서 왔으면 이전 화면, 주소로 바로 들어왔으면 첫 화면은 앱 홈으로, 하위 화면은 분쟁 첫 화면으로.
  const goBack = useGoBack(location.pathname === DISPUTES_PATH ? 'home' : 'disputes');

  return (
    <AppTabShell backBar={{ title: titleOf(location.pathname), onBack: goBack }}>
      <DisputePage isApp onNavigate={onNavigate} onUnauthorized={onUnauthorized} />
    </AppTabShell>
  );
};

// AI 상담(/disputes/chat, 주동욱 님 화면)에 앱 틀(하단 탭 없음)을 씌운다. 화면은 isApp으로 안쪽 제목을 숨기고 입력창을 아래에 붙인다.
export const DisputeChatAppScreen = ({ children }) => {
  const goBack = useGoBack('disputes');
  return (
    <MobileFormLayout shell="landlord-app-detail" topBar={{ title: 'AI 상담', onBack: goBack }}>
      {children}
    </MobileFormLayout>
  );
};
