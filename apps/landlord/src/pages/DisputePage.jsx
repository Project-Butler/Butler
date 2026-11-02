import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DisputeChatPanel } from '../components/DisputeChat/DisputeChatPanel';
import { useDisputeConversation } from '../hooks/useDisputeConversation';
import { useMediaQuery } from '../hooks/useMediaQuery';

// 오른쪽 AI 상담 패널을 함께 띄우는 폭. 1024~1279px는 사이드바와 목록만으로도 좁아서 모바일처럼 챗봇 화면으로 이동한다.
const WIDE_QUERY = '(min-width: 1280px)';

// 임대차 분쟁 해결사(3팀 피처). 왼쪽은 검색(질문·사례 통합)·사례 상세(Outlet), 넓은 화면에서는 오른쪽에 AI 상담 패널.
// 대화는 이 화면이 들고 있어서 사례를 오가도 그대로 남는다. 검색 조건은 검색 화면의 주소에 있다.
export const DisputePage = ({ onNavigate, onUnauthorized }) => {
  const isWide = useMediaQuery(WIDE_QUERY);
  const conversation = useDisputeConversation();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const location = useLocation();
  const routerNavigate = useNavigate();

  // 넓은 화면은 오른쪽 패널을 열고, 아니면 챗봇 화면으로 이동한다. draft는 입력창에 미리 넣을 질문.
  const askAi = (draft) => {
    if (isWide) {
      if (draft) conversation.setDraft(draft);
      setIsPanelOpen(true);
      return;
    }
    onNavigate('disputeChat', { draft });
  };

  const openReference = (referenceId) => onNavigate('disputeReference', { referenceId });
  // 사례 상세의 뒤로: 앱 안에서 왔으면 보던 목록(검색 조건 그대로)으로, 주소로 바로 들어왔으면 첫 화면으로.
  const goBack = () => (location.key !== 'default' ? routerNavigate(-1) : onNavigate('disputes'));

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        <Outlet context={{ askAi, openReference, goBack, onNavigate, onUnauthorized }} />
      </div>
      {isWide && (
        <DisputeChatPanel
          conversation={conversation}
          isOpen={isPanelOpen}
          onOpen={() => setIsPanelOpen(true)}
          onOpenReference={openReference}
        />
      )}
    </div>
  );
};
