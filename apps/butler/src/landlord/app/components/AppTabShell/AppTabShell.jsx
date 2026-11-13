import { useLocation, useNavigate } from 'react-router-dom';
import { MobileShell } from '@butler/ui';
import { isTabActive, TABS } from '../../tabs';

// 하단 탭이 있는 임대인 앱 화면의 틀. 탭 4칸과 활성 표시는 여기서 주소로 정한다.
// topBar: 홈형 상단 바(TopBar) props, backBar: 뒤로 가기 상단 바(BackTopBar) props — backBar 를 주면 그쪽을 그린다.
export const AppTabShell = ({ topBar, backBar, children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = TABS.map((tab) => ({ ...tab, active: isTabActive(tab, pathname), onClick: () => navigate(tab.path) }));

  return (
    <MobileShell shell="landlord-app" topBar={topBar} backBar={backBar} tabs={tabs}>
      {children}
    </MobileShell>
  );
};
