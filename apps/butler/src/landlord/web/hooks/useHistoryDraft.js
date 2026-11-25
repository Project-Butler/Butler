import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// AI 상담으로 넘어올 때 history state 로 받은 질문(routes.js disputeChat 의 draft)을 한 번만 꺼낸다.
// 꺼낸 뒤 state 를 바로 비워서 새로고침·뒤로 가기로 다시 들어와도 같은 질문이 또 채워지지 않는다(앱 홈 notice 와 같은 방식).
export const useHistoryDraft = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [draft] = useState(() => location.state?.draft ?? '');

  useEffect(() => {
    if (location.state?.draft) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  return draft;
};
