import { useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DisputeChatPanel } from '../components/DisputeChat/DisputeChatPanel';
import { useDisputeConversation } from '../hooks/useDisputeConversation';
import { useMediaQuery } from '../hooks/useMediaQuery';

// 오른쪽 AI를 늘 붙여 두는 폭. 그보다 좁으면 모바일처럼 챗봇 화면으로 이동한다.
const WIDE_QUERY = '(min-width: 1280px)';

// 화면이 질문 칩을 정하지 않았을 때 쓰는 기본 질문
const DEFAULT_SUGGESTIONS = ['계약이 끝났는데 보증금을 언제까지 돌려줘야 하나요?', '세입자가 원상복구를 안 하고 나갔어요'];

// 임대차 분쟁(3팀 피처). 왼쪽은 첫 화면·상황 안내·자료 찾기·사례 상세(Outlet), 넓은 화면에서는 오른쪽에 AI를 늘 붙여 둔다.
// 정리된 안내를 읽다가 어려우면 바로 옆에서 물어보게 하고, 각 화면은 setAiSuggestions로 그 화면에 맞는 질문 칩을 정한다.
// 대화는 이 화면이 들고 있어서 AI를 접거나 사례를 오가도 그대로 남는다. 검색 조건은 자료 찾기 화면의 주소에 있다.
export const DisputePage = ({ onNavigate, onUnauthorized }) => {
  const isWide = useMediaQuery(WIDE_QUERY);
  const conversation = useDisputeConversation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const setAiSuggestions = useCallback((items) => setSuggestions(items?.length ? items : DEFAULT_SUGGESTIONS), []);
  const location = useLocation();
  const routerNavigate = useNavigate();

  // 넓은 화면은 오른쪽 AI를 펼치고 질문을 채우며, 아니면 챗봇 화면으로 이동한다. draft는 입력창에 미리 넣을 질문.
  const askAi = (draft) => {
    if (isWide) {
      if (draft) conversation.setDraft(draft);
      setIsCollapsed(false);
      return;
    }
    onNavigate('disputeChat', { draft });
  };

  const openReference = (referenceId) => onNavigate('disputeReference', { referenceId });
  // 하위 화면의 뒤로: 앱 안에서 왔으면 보던 화면(검색 조건 그대로)으로, 주소로 바로 들어왔으면 첫 화면으로.
  const goBack = () => (location.key !== 'default' ? routerNavigate(-1) : onNavigate('disputes'));

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        {/* isWideContent: 오른쪽 AI를 접어 본문이 화면을 꽉 채울 때. 첫 화면은 이때 카드 칸 수를 늘린다. */}
        <Outlet
          context={{
            askAi,
            isAiDocked: isWide,
            isWideContent: isWide && isCollapsed,
            setAiSuggestions,
            openReference,
            goBack,
            onNavigate,
            onUnauthorized,
          }}
        />
      </div>
      {isWide && (
        <DisputeChatPanel
          conversation={conversation}
          suggestions={suggestions}
          isCollapsed={isCollapsed}
          onCollapse={() => setIsCollapsed(true)}
          onExpand={() => setIsCollapsed(false)}
          onOpenReference={openReference}
        />
      )}
    </div>
  );
};
