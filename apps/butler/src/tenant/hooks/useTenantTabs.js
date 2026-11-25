import { useLocation, useNavigate } from 'react-router-dom';
import { isTabActive, TABS } from '../tabs';

// 하단 탭(홈 · 수리 요청 · 내 정보) 항목. 탭 화면과 하단 탭이 있는 상세 화면(요청 상세·알림)이 같이 쓴다.
export const useTenantTabs = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return TABS.map((tab) => ({ ...tab, active: isTabActive(tab, pathname), onClick: () => navigate(tab.path) }));
};
